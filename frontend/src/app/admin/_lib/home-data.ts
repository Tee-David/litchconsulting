import "server-only";
import { and, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoice, payment, requestAssignment, serviceOffering, serviceRequest, user } from "@/lib/db/schema";
import { num } from "@/lib/invoice/money";
import { statusDef } from "@/components/kit/status-chip";
import { TERMINAL_STATUSES } from "@/lib/requests/status";

export type HomePeriod = "week" | "month" | "year";
export const isHomePeriod = (p: unknown): p is HomePeriod => p === "week" || p === "month" || p === "year";

const D = 86_400_000;
const OPEN_INVOICE = ["sent", "viewed", "overdue", "partially_paid"];

type Bucket = { key: string; label: string; start: number; end: number };

/** Chart buckets: week = 7 days, month = 30 days (daily), year = 12 months. */
function buckets(period: HomePeriod, now = new Date()): Bucket[] {
  if (period === "year") {
    return Array.from({ length: 12 }, (_, i) => {
      const s = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
      return { key: s.toISOString().slice(0, 7), label: s.toLocaleString("en-GB", { month: "short" }), start: s.getTime(), end: e.getTime() };
    });
  }
  const days = period === "week" ? 7 : 30;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Array.from({ length: days }, (_, i) => {
    const s = new Date(today.getTime() - (days - 1 - i) * D);
    return {
      key: s.toISOString().slice(0, 10),
      label: period === "week" ? s.toLocaleString("en-GB", { weekday: "short" }) : s.toLocaleString("en-GB", { day: "numeric", month: "short" }),
      start: s.getTime(),
      end: s.getTime() + D,
    };
  });
}

/** Turnaround text ("3–5 business days", "2 weeks") → calendar days, or null. */
export function turnaroundDays(text: string | null | undefined): number | null {
  if (!text) return null;
  const nums = [...text.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  if (!nums.length) return null;
  const n = Math.max(...nums);
  if (/week/i.test(text)) return n * 7;
  if (/month/i.test(text)) return n * 30;
  if (/business|working/i.test(text)) return Math.ceil((n * 7) / 5);
  return n;
}

export async function homeData(period: HomePeriod) {
  const now = new Date();
  const bs = buckets(period, now);
  const from = new Date(bs[0].start);
  const span = bs[bs.length - 1].end - bs[0].start;
  const prevFrom = new Date(bs[0].start - span);
  const today = now.toISOString().slice(0, 10);

  const [paid, billed, owed, openReqs, delivered, offerings, opened, team] = await Promise.all([
    db
      .select({ amount: payment.amount, settled: payment.amountSettled, at: payment.paidAt, created: payment.createdAt })
      .from(payment)
      .where(and(eq(payment.status, "success"), gte(sql`coalesce(${payment.paidAt}, ${payment.createdAt})`, prevFrom))),
    db
      .select({ total: invoice.total, issueDate: invoice.issueDate })
      .from(invoice)
      .where(and(isNull(invoice.deletedAt), eq(invoice.kind, "invoice"), sql`${invoice.status} NOT IN ('draft','void')`, gte(invoice.issueDate, from.toISOString().slice(0, 10)))),
    db
      .select({ total: invoice.total, paid: invoice.amountPaid, due: invoice.dueDate })
      .from(invoice)
      .where(and(isNull(invoice.deletedAt), eq(invoice.kind, "invoice"), inArray(invoice.status, OPEN_INVOICE))),
    db
      .select({ status: serviceRequest.status, n: sql<number>`count(*)` })
      .from(serviceRequest)
      .where(and(isNull(serviceRequest.deletedAt), sql`${serviceRequest.status} NOT IN ('completed','cancelled','declined','refunded')`))
      .groupBy(serviceRequest.status),
    db
      .select({ slug: serviceRequest.serviceSlug, created: serviceRequest.createdAt, delivered: serviceRequest.deliveredAt })
      .from(serviceRequest)
      .where(and(isNull(serviceRequest.deletedAt), isNotNull(serviceRequest.deliveredAt), gte(serviceRequest.deliveredAt, new Date(now.getTime() - 90 * D)))),
    db.select({ slug: serviceOffering.slug, turnaround: serviceOffering.turnaround }).from(serviceOffering),
    db
      .select({ created: serviceRequest.createdAt, delivered: serviceRequest.deliveredAt })
      .from(serviceRequest)
      .where(and(isNull(serviceRequest.deletedAt), sql`(${serviceRequest.createdAt} >= ${from} OR ${serviceRequest.deliveredAt} >= ${from})`)),
    db
      .select({ userId: requestAssignment.userId, name: user.name, email: user.email, status: serviceRequest.status })
      .from(requestAssignment)
      .innerJoin(serviceRequest, eq(serviceRequest.id, requestAssignment.requestId))
      .leftJoin(user, eq(user.id, requestAssignment.userId))
      .where(isNull(serviceRequest.deletedAt)),
  ]);

  const paidAt = (p: (typeof paid)[number]) => new Date(p.at ?? p.created).getTime();
  const amt = (p: (typeof paid)[number]) => num(p.settled ?? p.amount);
  const collected = paid.filter((p) => paidAt(p) >= from.getTime()).reduce((s, p) => s + amt(p), 0);
  const collectedPrev = paid.filter((p) => paidAt(p) < from.getTime()).reduce((s, p) => s + amt(p), 0);

  const owedTotal = owed.reduce((s, i) => s + (num(i.total) - num(i.paid)), 0);
  const late = owed.filter((i) => i.due && i.due < today);
  const lateTotal = late.reduce((s, i) => s + (num(i.total) - num(i.paid)), 0);

  const counts = openReqs.map((r) => ({ status: r.status, n: Number(r.n) }));
  const openTotal = counts.reduce((s, r) => s + r.n, 0);
  const withUs = counts.filter((r) => statusDef("request", r.status).move === "us").reduce((s, r) => s + r.n, 0);
  const withClient = counts.filter((r) => statusDef("request", r.status).move === "wait").reduce((s, r) => s + r.n, 0);

  const target = new Map(offerings.map((o) => [o.slug, turnaroundDays(o.turnaround)]));
  const onTime = delivered.filter((r) => {
    const t = target.get(r.slug) ?? 14;
    return new Date(r.delivered!).getTime() - new Date(r.created).getTime() <= (t ?? 14) * D;
  }).length;

  const money = bs.map((b) => ({
    label: b.label,
    billed: billed.filter((i) => {
      const t = new Date(i.issueDate).getTime();
      return t >= b.start && t < b.end;
    }).reduce((s, i) => s + num(i.total), 0),
    collected: paid.filter((p) => paidAt(p) >= b.start && paidAt(p) < b.end).reduce((s, p) => s + amt(p), 0),
  }));
  const flow = bs.map((b) => ({
    label: b.label,
    opened: opened.filter((r) => new Date(r.created).getTime() >= b.start && new Date(r.created).getTime() < b.end).length,
    delivered: opened.filter((r) => r.delivered && new Date(r.delivered).getTime() >= b.start && new Date(r.delivered).getTime() < b.end).length,
  }));

  // Where open requests are, in lifecycle order.
  const STAGES: Array<{ label: string; statuses: string[]; tone: "warn" | "info" | "brand" | "good" }> = [
    { label: "Quote", statuses: ["quote_requested", "quote_sent"], tone: "warn" },
    { label: "Payment", statuses: ["pending_payment"], tone: "warn" },
    { label: "Documents", statuses: ["awaiting_documents"], tone: "warn" },
    { label: "In progress", statuses: ["in_progress", "in_review"], tone: "info" },
    { label: "Client review", statuses: ["client_review"], tone: "brand" },
    { label: "Delivered", statuses: ["delivered"], tone: "good" },
  ];
  const stages = STAGES.map((s) => ({ ...s, n: counts.filter((c) => s.statuses.includes(c.status)).reduce((a, c) => a + c.n, 0) }));

  const load = new Map<string, { name: string; open: number }>();
  for (const t of team) {
    if ((TERMINAL_STATUSES as string[]).includes(t.status)) continue;
    const cur = load.get(t.userId) ?? { name: t.name || t.email || "Team member", open: 0 };
    cur.open++;
    load.set(t.userId, cur);
  }

  return {
    collected,
    collectedPrev,
    owedTotal,
    owedCount: owed.length,
    lateTotal,
    lateCount: late.length,
    openTotal,
    withUs,
    withClient,
    onTime,
    deliveredCount: delivered.length,
    money,
    flow,
    stages,
    teamLoad: [...load.values()].sort((a, b) => b.open - a.open).slice(0, 6),
  };
}
