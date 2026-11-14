import { NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { client, invoice, serviceRequest } from "@/lib/db/schema";
import { sendTemplate } from "@/lib/email-templates";
import type { DigestRequest } from "@/lib/emails/digest";
import { ACTIVE_STATUSES, STATUS_LABELS, type RequestStatus } from "@/lib/requests/status";
import { formatMoney, num } from "@/lib/invoice/money";

export const dynamic = "force-dynamic";

/** Send admins a short summary of the week's Good / Bad votes on Sage answers. */
async function sageWeekly(base: string) {
  const { sageQuality } = await import("@/lib/sage/quality");
  const { user } = await import("@/lib/db/schema");
  const q = await sageQuality(7);
  if (!q.votes.length) return { sent: 0, votes: 0 };
  const admins = await db.select({ email: user.email, name: user.name }).from(user).where(and(eq(user.role, "admin"), eq(user.banned, false)));
  const worst = q.votes.filter((v) => v.vote === "bad").slice(0, 5);
  const week = new Date().toISOString().slice(0, 10);
  let sent = 0;
  for (const a of admins) {
    try {
      await sendTemplate(
        "notice",
        {
          subject: `Sage this week: ${q.good} good, ${q.bad} bad`,
          heading: "How Sage's answers were rated this week",
          name: a.name,
          paragraphs: [
            `People rated **${q.good + q.bad}** answers: **${q.good}** good and **${q.bad}** bad.`,
            ...(worst.length
              ? ["The bad ones, newest first:", worst.map((v) => `**${v.question.slice(0, 90) || "(no question)"}**${v.note ? ` · “${v.note.slice(0, 120)}”` : ""} · ${v.source}, ${v.route}, ${v.tool}`).join("\n")]
              : ["No answer was rated bad."]),
          ],
          rows: [
            ...q.badBy.route.slice(0, 3).map(([k, n]) => ({ label: `Bad via route: ${k}`, value: String(n) })),
            ...q.badBy.model.slice(0, 3).map(([k, n]) => ({ label: `Bad from model: ${k}`, value: String(n) })),
          ],
          cta: { label: "Open the full report", href: `${base}/admin/sage/quality` },
          why: "You got this because you are an admin at Litch Consulting and Sage answers were rated this week.",
        },
        { to: a.email, dedupeKey: `sage-weekly:${week}:${a.email}` },
      );
      sent++;
    } catch {
      /* one failed send must not stop the others; the outbox retries */
    }
  }
  return { sent, votes: q.votes.length };
}
export const maxDuration = 60;

function baseUrl() {
  return (
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://litchconsulting.com"
  ).replace(/\/$/, "");
}

/**
 * WEEKLY CLIENT DIGEST (Vercel Cron, weekly — see vercel.json).
 * For every live client with an email who hasn't opted out, send a short
 * branded summary: active requests, amounts due, deliverables ready. Clients
 * with nothing to report are skipped so the digest never becomes noise.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const clients = await db
    .select()
    .from(client)
    .where(and(isNull(client.deletedAt), eq(client.digestOptOut, false)));

  const summary = { candidates: clients.length, sent: 0, skipped: 0 };
  const base = baseUrl();

  for (const c of clients) {
    if (!c.email) {
      summary.skipped++;
      continue;
    }

    const requests = await db
      .select({
        number: serviceRequest.number,
        serviceName: serviceRequest.serviceName,
        status: serviceRequest.status,
      })
      .from(serviceRequest)
      .where(and(eq(serviceRequest.clientId, c.id), isNull(serviceRequest.deletedAt)));

    const activeRequests: DigestRequest[] = requests.filter((r) =>
      (ACTIVE_STATUSES as string[]).includes(r.status),
    );
    const deliverablesReady = requests.filter((r) => r.status === "delivered").length;

    const openInvoices = await db
      .select({ total: invoice.total, amountPaid: invoice.amountPaid, currency: invoice.currency })
      .from(invoice)
      .where(
        and(
          eq(invoice.clientId, c.id),
          isNull(invoice.deletedAt),
          inArray(invoice.status, ["sent", "overdue"]),
        ),
      );

    const amountDue = openInvoices.reduce((s, inv) => s + (num(inv.total) - num(inv.amountPaid)), 0);
    const currency = openInvoices[0]?.currency || "NGN";

    // Nothing worth emailing about this week.
    if (activeRequests.length === 0 && amountDue <= 0 && deliverablesReady === 0) {
      summary.skipped++;
      continue;
    }

    const needsYou = [
      ...(amountDue > 0 ? [`**${formatMoney(amountDue, currency)}** to pay on open invoices`] : []),
      ...(deliverablesReady > 0 ? [`${deliverablesReady} ${deliverablesReady === 1 ? "piece of work is" : "pieces of work are"} ready to download`] : []),
    ];
    const updates = activeRequests.map((r) => `**${r.number}** · ${r.serviceName} · ${STATUS_LABELS[r.status as RequestStatus] ?? r.status}`);
    try {
      await sendTemplate(
        "digest",
        {
          name: c.name,
          dateLabel: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "Africa/Lagos" }).format(new Date()),
          needsYou,
          updates,
          url: `${base}/dashboard`,
          categoryLabel: "your weekly summary",
        },
        { to: c.email, audience: "client" },
      );
      summary.sent++;
    } catch (err) {
      console.error("[digest] send failed for", c.id, err);
      summary.skipped++;
    }
  }

  // H1: the week's Sage votes to every admin, only when there are any.
  const quality = await sageWeekly(base).catch(() => null);
  return NextResponse.json({ ok: true, ...summary, sageQuality: quality });
}
