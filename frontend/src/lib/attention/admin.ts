import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  client,
  emailOutbox,
  invoice,
  payment,
  requestAssignment,
  requestItem,
  serviceRequest,
  ticket,
  ticketMessage,
} from "@/lib/db/schema";
import { formatMoney, num } from "@/lib/invoice/money";
import { TERMINAL_STATUSES } from "@/lib/requests/status";
import type { AttentionItem } from "@/components/kit";

/**
 * Admin "What needs you" — built from live rows, worst first.
 *
 * Every item id is `<kind>:<row id>` so the row's server action (see
 * app/admin/attention-actions.ts) can find its record again and re-check it.
 * Severity: 3 money that is stuck / late, 2 someone is waiting on us, 1 new
 * work and housekeeping. Each source is capped so one flood (e.g. 40 failed
 * emails) cannot push everything else off the screen.
 */

const H = 3_600_000;
const D = 24 * H;
/** A quote with no answer after this many days needs a follow-up. */
export const QUOTE_FOLLOW_UP_DAYS = 5;
/** A draft with the client this long gets a nudge. */
export const REVIEW_NUDGE_DAYS = 3;
const CAP = 6;

const OPEN_INVOICE = ["sent", "viewed", "overdue", "partially_paid"];

function ago(d: Date | string | null | undefined): string {
  if (!d) return "";
  const s = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}
const day = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

const nameOf = (c?: { company: string | null; name: string } | null) => c?.company || c?.name || "A client";

/** Proof rows the firm still has to confirm or reject. */
export const proofPending = () =>
  and(isNotNull(payment.proofKey), isNull(payment.confirmedAt), sql`${payment.status} NOT IN ('rejected','success')`);

export const buildAdminAttention = cache(async (): Promise<AttentionItem[]> => {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  const [proofs, overdue, tickets, inReview, clientReview, quotes, unassigned, supplied, failedMail] = await Promise.all([
    db
      .select({ p: payment, inv: invoice })
      .from(payment)
      .leftJoin(invoice, eq(invoice.id, payment.invoiceId))
      .where(proofPending())
      .orderBy(asc(payment.createdAt))
      .limit(CAP),
    db
      .select()
      .from(invoice)
      .where(
        and(
          isNull(invoice.deletedAt),
          eq(invoice.kind, "invoice"),
          inArray(invoice.status, OPEN_INVOICE),
          isNotNull(invoice.dueDate),
          lt(invoice.dueDate, today),
        ),
      )
      .orderBy(asc(invoice.dueDate))
      .limit(CAP),
    // Open tickets whose latest message is from the client.
    db
      .select({
        t: ticket,
        lastRole: sql<string>`(SELECT ${ticketMessage.authorRole} FROM ${ticketMessage} WHERE ${ticketMessage.ticketId} = ${ticket.id} ORDER BY ${ticketMessage.createdAt} DESC LIMIT 1)`,
        lastBody: sql<string>`(SELECT ${ticketMessage.body} FROM ${ticketMessage} WHERE ${ticketMessage.ticketId} = ${ticket.id} ORDER BY ${ticketMessage.createdAt} DESC LIMIT 1)`,
      })
      .from(ticket)
      .where(and(isNull(ticket.deletedAt), inArray(ticket.status, ["open", "pending"])))
      .orderBy(asc(sql`coalesce(${ticket.lastReplyAt}, ${ticket.createdAt})`))
      .limit(30),
    db
      .select({ r: serviceRequest, c: client })
      .from(serviceRequest)
      .leftJoin(client, eq(client.id, serviceRequest.clientId))
      .where(and(isNull(serviceRequest.deletedAt), eq(serviceRequest.status, "in_review")))
      .orderBy(asc(serviceRequest.updatedAt))
      .limit(CAP),
    db
      .select({ r: serviceRequest, c: client })
      .from(serviceRequest)
      .leftJoin(client, eq(client.id, serviceRequest.clientId))
      .where(
        and(
          isNull(serviceRequest.deletedAt),
          eq(serviceRequest.status, "client_review"),
          lt(serviceRequest.updatedAt, new Date(now - REVIEW_NUDGE_DAYS * D)),
        ),
      )
      .orderBy(asc(serviceRequest.updatedAt))
      .limit(CAP),
    db
      .select()
      .from(invoice)
      .where(
        and(
          isNull(invoice.deletedAt),
          eq(invoice.kind, "quote"),
          eq(invoice.status, "sent"),
          lt(sql`coalesce(${invoice.sentAt}, ${invoice.createdAt})`, new Date(now - QUOTE_FOLLOW_UP_DAYS * D)),
        ),
      )
      .orderBy(asc(invoice.sentAt))
      .limit(CAP),
    db
      .select({ r: serviceRequest, c: client })
      .from(serviceRequest)
      .leftJoin(client, eq(client.id, serviceRequest.clientId))
      .where(
        and(
          isNull(serviceRequest.deletedAt),
          notInArray(serviceRequest.status, TERMINAL_STATUSES),
          isNull(serviceRequest.assignee),
          sql`NOT EXISTS (SELECT 1 FROM ${requestAssignment} WHERE ${requestAssignment.requestId} = ${serviceRequest.id})`,
        ),
      )
      .orderBy(desc(serviceRequest.createdAt))
      .limit(CAP),
    db
      .select({ i: requestItem, r: serviceRequest, c: client })
      .from(requestItem)
      .innerJoin(serviceRequest, eq(serviceRequest.id, requestItem.requestId))
      .leftJoin(client, eq(client.id, serviceRequest.clientId))
      .where(and(eq(requestItem.status, "supplied"), isNull(serviceRequest.deletedAt)))
      .orderBy(asc(requestItem.suppliedAt))
      .limit(CAP),
    db
      .select()
      .from(emailOutbox)
      .where(and(eq(emailOutbox.status, "failed"), sql`${emailOutbox.createdAt} > now() - interval '14 days'`))
      .orderBy(desc(emailOutbox.createdAt))
      .limit(CAP),
  ]);

  const items: AttentionItem[] = [];

  for (const { p, inv } of proofs) {
    const amt = num(p.amount);
    const due = inv ? num(inv.total) - num(inv.amountPaid) : 0;
    const diff = inv ? due - amt : 0;
    const match = !inv ? "No invoice found" : Math.abs(diff) < 0.5 ? `matches ${inv.number}` : diff > 0 ? `${formatMoney(diff)} short of ${inv.number}` : `${formatMoney(-diff)} more than ${inv.number}`;
    items.push({
      id: `proof:${p.id}`,
      group: "Money",
      severity: 3,
      icon: "bank",
      title: `Confirm a bank transfer from ${inv?.billToCompany || inv?.billToName || "a client"}`,
      detail: `${formatMoney(amt, p.currency)} ${match}`,
      when: `Proof uploaded ${ago(p.createdAt).toLowerCase()}`,
      whenTone: "bad",
      amount: formatMoney(amt, p.currency),
      primary: { label: "Check and confirm", href: `/admin/billing/payments?proof=${p.id}` },
    });
  }

  for (const inv of overdue) {
    const bal = num(inv.total) - num(inv.amountPaid);
    const daysLate = Math.max(1, Math.round((now - new Date(inv.dueDate as string).getTime()) / D));
    items.push({
      id: `overdue:${inv.id}`,
      group: "Money",
      severity: 3,
      icon: "invoice",
      title: `${inv.number} is ${daysLate} ${daysLate === 1 ? "day" : "days"} late`,
      detail: `${inv.billToCompany || inv.billToName || "Client"} · ${formatMoney(bal, inv.currency)} outstanding${inv.billToEmail ? "" : " · no email on the invoice"}`,
      when: `Due ${day(inv.dueDate as string)}`,
      whenTone: "bad",
      amount: formatMoney(bal, inv.currency),
      primary: inv.billToEmail ? { label: "Send reminder", actionId: "remindInvoice" } : { label: "Open invoice", href: `/admin/billing/invoices/${inv.id}` },
      more: [{ label: "Open invoice", href: `/admin/billing/invoices/${inv.id}` }],
    });
  }

  for (const { t, lastRole, lastBody } of tickets) {
    if (lastRole !== "client") continue;
    if (items.filter((i) => i.id.startsWith("ticket:")).length >= CAP) break;
    items.push({
      id: `ticket:${t.id}`,
      group: "Clients",
      severity: 2,
      icon: "reply",
      title: `${t.requesterName || "A client"} is waiting for a reply`,
      detail: `${t.number} · ${lastBody ? `“${lastBody.slice(0, 110)}${lastBody.length > 110 ? "…" : ""}”` : t.subject}`,
      when: ago(t.lastReplyAt ?? t.createdAt),
      whenTone: now - new Date(t.lastReplyAt ?? t.createdAt).getTime() > D ? "warn" : "muted",
      primary: { label: "Reply", href: `/admin/help-desk?ticket=${t.id}` },
    });
  }

  for (const { r, c } of inReview) {
    items.push({
      id: `review:${r.id}`,
      group: "Work",
      severity: 2,
      icon: "review",
      title: `Approve the ${nameOf(c)} draft before it goes out`,
      detail: `${r.number} · ${r.serviceName} · in internal review`,
      when: ago(r.updatedAt),
      primary: { label: "Review draft", href: `/admin/requests/${r.id}?tab=deliverables` },
    });
  }

  for (const { r, c } of clientReview) {
    items.push({
      id: `clientreview:${r.id}`,
      group: "Clients",
      severity: 2,
      icon: "send",
      title: `${nameOf(c)} has not answered draft round ${Math.max(1, r.reviewRound)}`,
      detail: `${r.number} · ${r.serviceName} · with the client since ${day(r.updatedAt)}`,
      when: ago(r.updatedAt),
      whenTone: "warn",
      primary: { label: "Remind client", actionId: "remindReview" },
      more: [{ label: "Open request", href: `/admin/requests/${r.id}` }],
    });
  }

  for (const q of quotes) {
    const days = Math.round((now - new Date(q.sentAt ?? q.createdAt).getTime()) / D);
    items.push({
      id: `quote:${q.id}`,
      group: "Money",
      severity: 2,
      icon: "send",
      title: `Quote ${q.number} has no answer for ${days} days`,
      detail: `${q.billToCompany || q.billToName || "Client"}${q.projectTitle ? ` · ${q.projectTitle}` : ""} · ${formatMoney(num(q.total), q.currency)}`,
      when: q.dueDate ? `Valid to ${day(q.dueDate)}` : `Sent ${day(q.sentAt ?? q.createdAt)}`,
      whenTone: "warn",
      primary: q.billToEmail ? { label: "Follow up", actionId: "followUpQuote" } : { label: "Open quote", href: `/admin/billing/quotes/${q.id}` },
      more: [{ label: "Open quote", href: `/admin/billing/quotes/${q.id}` }],
    });
  }

  for (const { r, c } of unassigned) {
    items.push({
      id: `assign:${r.id}`,
      group: "Work",
      severity: 1,
      icon: "assign",
      title: r.status === "quote_requested" ? `${nameOf(c)} asked for a quote` : `${nameOf(c)}: nobody is assigned`,
      detail: `${r.number} · ${r.serviceName} · not assigned`,
      when: ago(r.createdAt),
      primary: { label: "Assign to me", actionId: "assignMe" },
      more: [{ label: "Choose who", href: `/admin/requests/${r.id}?assign=1` }],
    });
  }

  for (const { i, r, c } of supplied) {
    items.push({
      id: `item:${i.id}`,
      group: "Work",
      severity: 1,
      icon: "upload",
      title: `${nameOf(c)} supplied ${i.kind === "document" ? "a document" : "an answer"}`,
      detail: `${i.title} · for ${r.number}`,
      when: ago(i.suppliedAt ?? i.updatedAt),
      primary: { label: "Mark received", actionId: "markReceived" },
      more: [{ label: "Open request", href: `/admin/requests/${r.id}?tab=items` }],
    });
  }

  for (const m of failedMail) {
    items.push({
      id: `mail:${m.id}`,
      group: "Work",
      severity: 1,
      icon: "mail",
      title: "An email did not send",
      detail: `“${m.subject}” to ${m.to}${m.lastError ? ` · ${m.lastError.slice(0, 80)}` : ""}`,
      when: day(m.createdAt),
      primary: m.retryable && m.payload ? { label: "Retry", actionId: "retryEmail" } : { label: "Dismiss", actionId: "dismissEmail" },
      more: m.retryable && m.payload ? [{ label: "Dismiss", actionId: "dismissEmail" }] : undefined,
    });
  }

  return items.sort((a, b) => b.severity - a.severity);
});

/** Cheap count for the sidebar badge (same sources, no detail). */
export async function attentionCount(): Promise<number> {
  const items = await buildAdminAttention();
  return items.length;
}
