import "server-only";
import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { payment, serviceRequest, ticket, ticketMessage } from "@/lib/db/schema";

/**
 * The admin's "needs your action" worklist — everything currently blocked on
 * the operator, ordered by severity then age (oldest = most overdue first).
 * Each source is capped at 5, the whole list at 10; every row deep-links.
 */
export type AttentionItem = {
  id: string;
  kind:
    | "flagged_payment"
    | "quote_overdue"
    | "ticket_waiting"
    | "delivered_open"
    | "work_stalled"
    | "docs_stalled"
    | "ai_review";
  title: string;
  detail: string;
  href: string;
  at: string; // ISO — age anchor
  tone: "danger" | "warning";
};

const H = 3_600_000;
const D = 24 * H;

export async function needsAttention(): Promise<AttentionItem[]> {
  const now = Date.now();
  const [flagged, quotesOverdue, openTickets, deliveredOpen, workStalled, docsStalled] =
    await Promise.all([
      db
        .select()
        .from(payment)
        .where(inArray(payment.status, ["flagged_amount_mismatch", "duplicate_success"]))
        .orderBy(asc(payment.updatedAt))
        .limit(5),
      db
        .select()
        .from(serviceRequest)
        .where(
          and(
            eq(serviceRequest.status, "quote_requested"),
            lt(serviceRequest.createdAt, new Date(now - 48 * H))
          )
        )
        .orderBy(asc(serviceRequest.createdAt))
        .limit(5),
      db
        .select()
        .from(ticket)
        .where(inArray(ticket.status, ["open", "pending"]))
        .orderBy(asc(ticket.lastReplyAt))
        .limit(20),
      db
        .select()
        .from(serviceRequest)
        .where(
          and(
            eq(serviceRequest.status, "delivered"),
            lt(serviceRequest.deliveredAt, new Date(now - 3 * D))
          )
        )
        .orderBy(asc(serviceRequest.deliveredAt))
        .limit(5),
      db
        .select()
        .from(serviceRequest)
        .where(
          and(
            eq(serviceRequest.status, "in_progress"),
            lt(serviceRequest.updatedAt, new Date(now - 5 * D))
          )
        )
        .orderBy(asc(serviceRequest.updatedAt))
        .limit(5),
      db
        .select()
        .from(serviceRequest)
        .where(
          and(
            eq(serviceRequest.status, "awaiting_documents"),
            lt(serviceRequest.updatedAt, new Date(now - 7 * D))
          )
        )
        .orderBy(asc(serviceRequest.updatedAt))
        .limit(5),
    ]);

  // Tickets whose LAST message came from the client (or that have no reply yet).
  let ticketsWaiting: typeof openTickets = [];
  if (openTickets.length) {
    const lastMsgs = await db
      .select({
        ticketId: ticketMessage.ticketId,
        authorRole: ticketMessage.authorRole,
        createdAt: ticketMessage.createdAt,
      })
      .from(ticketMessage)
      .where(inArray(ticketMessage.ticketId, openTickets.map((t) => t.id)))
      .orderBy(desc(ticketMessage.createdAt));
    const latestRole = new Map<string, string>();
    for (const m of lastMsgs) if (!latestRole.has(m.ticketId)) latestRole.set(m.ticketId, m.authorRole);
    ticketsWaiting = openTickets
      .filter((t) => (latestRole.get(t.id) ?? "client") === "client")
      .slice(0, 5);
  }

  const items: AttentionItem[] = [];

  for (const p of flagged) {
    items.push({
      id: `pay-${p.id}`,
      kind: "flagged_payment",
      title:
        p.status === "duplicate_success"
          ? "Refund needed — double payment"
          : "Payment amount mismatch",
      detail: `Reference ${p.reference}`,
      href: `/admin/finance/invoices/${p.invoiceId}`,
      at: (p.updatedAt as Date).toISOString(),
      tone: "danger",
    });
  }
  for (const r of quotesOverdue) {
    items.push({
      id: `quote-${r.id}`,
      kind: "quote_overdue",
      title: `Quote owed — ${r.number}`,
      detail: `${r.serviceName} · past the 2-business-day promise`,
      href: `/admin/requests/${r.id}`,
      at: (r.createdAt as Date).toISOString(),
      tone: "warning",
    });
  }
  for (const t of ticketsWaiting) {
    items.push({
      id: `ticket-${t.id}`,
      kind: "ticket_waiting",
      title: `Ticket waiting on you — ${t.number}`,
      detail: t.subject,
      href: "/admin/help-desk",
      at: ((t.lastReplyAt ?? t.createdAt) as Date).toISOString(),
      tone: "warning",
    });
  }
  for (const r of deliveredOpen) {
    items.push({
      id: `delivered-${r.id}`,
      kind: "delivered_open",
      title: `Delivered, not closed — ${r.number}`,
      detail: `${r.serviceName} · chase sign-off or close it out`,
      href: `/admin/requests/${r.id}`,
      at: ((r.deliveredAt ?? r.updatedAt) as Date).toISOString(),
      tone: "warning",
    });
  }
  for (const r of workStalled) {
    items.push({
      id: `stalled-${r.id}`,
      kind: "work_stalled",
      title: `No progress in 5+ days — ${r.number}`,
      detail: r.serviceName,
      href: `/admin/requests/${r.id}`,
      at: (r.updatedAt as Date).toISOString(),
      tone: "warning",
    });
  }
  for (const r of docsStalled) {
    items.push({
      id: `docs-${r.id}`,
      kind: "docs_stalled",
      title: `Still waiting on client docs — ${r.number}`,
      detail: `${r.serviceName} · nudge the client`,
      href: `/admin/requests/${r.id}`,
      at: (r.updatedAt as Date).toISOString(),
      tone: "warning",
    });
  }

  // AI review backlog (only when the backend is reachable; silent otherwise).
  if (process.env.LITCHAI_API_URL) {
    try {
      const { getObservability } = await import("@/lib/litchai/client");
      const obs = await getObservability();
      if (obs.needs_review_total > 0) {
        items.push({
          id: "ai-review",
          kind: "ai_review",
          title: `${obs.needs_review_total} AI line${obs.needs_review_total > 1 ? "s" : ""} awaiting review`,
          detail: "Risk-ordered queue in the AI Studio",
          href: "/admin/litchai",
          at: new Date().toISOString(),
          tone: "warning",
        });
      }
    } catch {
      // backend off — omit
    }
  }

  return items.slice(0, 10);
}
