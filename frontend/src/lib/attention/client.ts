import "server-only";
import { cache } from "react";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requestItem, serviceRequest } from "@/lib/db/schema";
import type { AttentionItem } from "@/components/kit";
import { formatMoney } from "@/lib/invoice/money";
import { balanceOf, depositOf, isPayable } from "@/lib/payments/amounts";
import { clientBilling, clientRequestRows, clientTicketsWaiting } from "@/lib/requests/portal";
import { INCLUDED_ROUNDS } from "@/lib/requests/review";

/**
 * The client's "what needs you": pay this, upload this, answer this, approve
 * this draft, accept this quote. Built from real rows for ONE client id (from
 * the session), worst first. Cached per request so the shell badge and the
 * home page share one computation.
 */

const DAY = 86_400_000;
const fmtDay = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short" });

function dueTone(due: Date | null): { when?: string; whenTone?: AttentionItem["whenTone"]; late: boolean } {
  if (!due) return { late: false };
  const late = due.getTime() < Date.now();
  const soon = due.getTime() - Date.now() < 2 * DAY;
  return { when: late ? `Overdue since ${fmtDay(due)}` : `By ${fmtDay(due)}`, whenTone: late ? "bad" : soon ? "warn" : "muted", late };
}

export const clientAttention = cache(async (clientId: string): Promise<AttentionItem[]> => {
  const [requests, billing, tickets, items] = await Promise.all([
    clientRequestRows(clientId),
    clientBilling(clientId),
    clientTicketsWaiting(clientId),
    db
      .select({ item: requestItem, number: serviceRequest.number, serviceName: serviceRequest.serviceName })
      .from(requestItem)
      .innerJoin(serviceRequest, eq(serviceRequest.id, requestItem.requestId))
      .where(and(eq(serviceRequest.clientId, clientId), isNull(serviceRequest.deletedAt), eq(requestItem.status, "open"))),
  ]);
  const out: AttentionItem[] = [];

  // Drafts to review.
  for (const r of requests.filter((x) => x.status === "client_review")) {
    const who = r.team[0]?.name;
    out.push({
      id: `review:${r.id}`,
      group: "Approve",
      severity: 3,
      icon: "review",
      title: `Review the draft of ${r.serviceName}`,
      detail: `${r.number} · round ${r.reviewRound} of ${INCLUDED_ROUNDS}${who ? ` · sent by ${who}` : ""} · approve or ask for changes`,
      primary: { label: "Review draft", href: `/dashboard/requests/${r.id}/review` },
      more: [{ label: "Open request", href: `/dashboard/requests/${r.id}` }],
    });
  }

  // Quotes to answer.
  for (const q of billing.quotes.filter((x) => ["sent", "viewed"].includes(x.status))) {
    const expired = q.dueDate && q.dueDate < new Date().toISOString().slice(0, 10);
    if (expired) continue;
    out.push({
      id: `quote:${q.id}`,
      group: "Pay",
      severity: 2,
      icon: "invoice",
      title: `Accept the ${q.projectTitle || "quote"} quote`,
      detail: `${q.number}${q.depositPercent ? ` · ${q.depositPercent}% deposit option` : ""}`,
      when: q.dueDate ? `Valid to ${fmtDay(q.dueDate)}` : undefined,
      amount: formatMoney(Number(q.total), q.currency),
      primary: { label: "Review quote", href: `/dashboard/quotes/${q.id}` },
    });
  }

  // Invoices to pay.
  for (const inv of billing.invoices.filter((x) => isPayable(x))) {
    const pending = billing.pendingTransfers.get(inv.id);
    const req = billing.requestByInvoice.get(inv.id);
    if (pending) {
      out.push({
        id: `transfer:${inv.id}`,
        group: "Pay",
        severity: 1,
        icon: "bank",
        title: `We are checking your transfer for ${inv.number}`,
        detail: "You uploaded a receipt. We confirm within a working day and email you.",
        amount: formatMoney(Number(pending.amount), inv.currency),
        primary: { label: "View payment", href: `/dashboard/billing/pay?invoice=${inv.id}` },
      });
      continue;
    }
    const deposit = depositOf(inv);
    const due = inv.dueDate ? new Date(`${inv.dueDate}T23:59:59+01:00`) : null;
    const t = dueTone(due);
    out.push({
      id: `pay:${inv.id}`,
      group: "Pay",
      severity: t.late || inv.status === "overdue" ? 3 : 2,
      icon: "pay",
      title: deposit !== null ? `Pay the deposit for ${inv.projectTitle || inv.number}` : inv.status === "partially_paid" ? `Pay the balance on ${inv.number}` : `Pay ${inv.number}`,
      detail: `${inv.projectTitle ? `${inv.projectTitle} · ` : ""}${req ? `${req.number} · ` : ""}card, bank app or transfer`,
      when: t.when,
      whenTone: t.whenTone,
      amount: formatMoney(deposit ?? balanceOf(inv), inv.currency),
      primary: { label: deposit !== null ? "Pay deposit" : "Pay now", href: `/dashboard/billing/pay?invoice=${inv.id}` },
      more: req ? [{ label: "Open request", href: `/dashboard/requests/${req.id}` }] : undefined,
    });
  }

  // Asks: upload / answer.
  for (const { item, number, serviceName } of items) {
    const t = dueTone(item.dueAt);
    const doc = item.kind === "document";
    out.push({
      id: `item:${item.id}`,
      group: doc ? "Upload" : "Answer",
      severity: t.late ? 3 : 2,
      icon: doc ? "upload" : "reply",
      title: doc ? `Upload ${item.title}` : item.title,
      detail: `${number} · ${serviceName}${item.detail ? ` · ${item.detail}` : ""}`,
      when: t.when,
      whenTone: t.whenTone,
      primary: { label: doc ? "Upload" : "Answer", href: `/dashboard/requests/${item.requestId}/asks#item-${item.id}` },
    });
  }

  // Required documents not yet uploaded.
  for (const r of requests.filter((x) => x.status === "awaiting_documents")) {
    out.push({
      id: `docs:${r.id}`,
      group: "Upload",
      severity: 2,
      icon: "upload",
      title: `Upload the documents for ${r.serviceName}`,
      detail: `${r.number} · we start as soon as the required files are in`,
      primary: { label: "Upload", href: `/dashboard/requests/${r.id}?tab=files` },
    });
  }

  // Delivered: confirm and close.
  for (const r of requests.filter((x) => x.status === "delivered")) {
    out.push({
      id: `close:${r.id}`,
      group: "Approve",
      severity: 1,
      icon: "approve",
      title: `Your ${r.serviceName} is delivered`,
      detail: `${r.number} · download the final files, then confirm to close the request`,
      primary: { label: "See files", href: `/dashboard/requests/${r.id}?tab=files` },
    });
  }

  // Support replies waiting on the client.
  for (const tk of tickets) {
    out.push({
      id: `ticket:${tk.id}`,
      group: "Answer",
      severity: 1,
      icon: "reply",
      title: `We replied: ${tk.subject}`,
      detail: `${tk.number} · your reply keeps it moving`,
      primary: { label: "Reply", href: `/dashboard/support/${tk.id}` },
    });
  }

  return out.sort((a, b) => b.severity - a.severity);
});
