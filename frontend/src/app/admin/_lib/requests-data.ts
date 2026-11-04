import "server-only";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  client,
  invoice,
  payment,
  requestAssignment,
  requestItem,
  reviewRound,
  serviceRequest,
  serviceRequestDocument,
  serviceRequestEvent,
  user,
} from "@/lib/db/schema";
import { num } from "@/lib/invoice/money";
import { statusDef } from "@/components/kit/status-chip";
import { TERMINAL_STATUSES } from "@/lib/requests/status";

export type TeamMember = { id: string; name: string; email: string; role: string };

/** Admins and staff who can be assigned work (banned users excluded). */
export async function listTeam(): Promise<TeamMember[]> {
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .where(and(inArray(user.role, ["admin", "staff"]), sql`coalesce(${user.banned}, false) = false`))
    .orderBy(user.name);
  return rows.map((r) => ({ ...r, name: r.name || r.email, role: r.role ?? "staff" }));
}

/** Plain-words next step per status, from the firm's side. */
export function nextStepFor(status: string, opts: { openItems?: number; suppliedItems?: number; round?: number } = {}): string {
  if (opts.suppliedItems) return `Check ${opts.suppliedItems} supplied ${opts.suppliedItems === 1 ? "item" : "items"}`;
  switch (status) {
    case "quote_requested":
      return "Write and send the quote";
    case "quote_sent":
      return "Client accepts the quote";
    case "pending_payment":
      return "Client pays the invoice";
    case "awaiting_documents":
      return opts.openItems ? `Client supplies ${opts.openItems} ${opts.openItems === 1 ? "item" : "items"}` : "Client uploads documents";
    case "in_progress":
      return "Prepare the draft";
    case "in_review":
      return "Approve the draft internally";
    case "client_review":
      return `Client reviews draft, round ${Math.max(1, opts.round ?? 1)}`;
    case "delivered":
      return "Close after the balance is paid";
    case "completed":
      return "Done";
    default:
      return "Closed";
  }
}

export type RequestRow = {
  id: string;
  number: string;
  client: string;
  clientId: string;
  service: string;
  serviceSlug: string;
  status: string;
  move: "us" | "wait" | "done" | "late" | "shut" | "draft";
  round: number;
  next: string;
  assignees: Array<{ id: string; name: string }>;
  legacyAssignee: string | null;
  value: number | null;
  currency: string;
  invoiceStatus: string | null;
  openItems: number;
  suppliedItems: number;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listRequestRows(): Promise<RequestRow[]> {
  const rows = await db
    .select({ r: serviceRequest, clientName: client.name, clientCompany: client.company, invTotal: invoice.total, invStatus: invoice.status })
    .from(serviceRequest)
    .leftJoin(client, eq(client.id, serviceRequest.clientId))
    .leftJoin(invoice, eq(invoice.id, serviceRequest.invoiceId))
    .where(isNull(serviceRequest.deletedAt))
    .orderBy(desc(serviceRequest.updatedAt))
    .limit(2000);
  const ids = rows.map((r) => r.r.id);
  const [assign, items] = ids.length
    ? await Promise.all([
        db
          .select({ requestId: requestAssignment.requestId, userId: requestAssignment.userId, name: user.name, email: user.email })
          .from(requestAssignment)
          .leftJoin(user, eq(user.id, requestAssignment.userId))
          .where(inArray(requestAssignment.requestId, ids)),
        db
          .select({ requestId: requestItem.requestId, status: requestItem.status, n: sql<number>`count(*)` })
          .from(requestItem)
          .where(and(inArray(requestItem.requestId, ids), inArray(requestItem.status, ["open", "supplied"])))
          .groupBy(requestItem.requestId, requestItem.status),
      ])
    : [[], []];

  return rows.map(({ r, clientName, clientCompany, invTotal, invStatus }) => {
    const openItems = Number(items.find((i) => i.requestId === r.id && i.status === "open")?.n ?? 0);
    const suppliedItems = Number(items.find((i) => i.requestId === r.id && i.status === "supplied")?.n ?? 0);
    return {
      id: r.id,
      number: r.number,
      client: clientCompany || clientName || "Unknown client",
      clientId: r.clientId,
      service: r.serviceName,
      serviceSlug: r.serviceSlug,
      status: r.status,
      move: statusDef("request", r.status).move,
      round: r.reviewRound,
      next: nextStepFor(r.status, { openItems, suppliedItems, round: r.reviewRound }),
      assignees: assign.filter((a) => a.requestId === r.id).map((a) => ({ id: a.userId, name: a.name || a.email || "Team member" })),
      legacyAssignee: r.assignee,
      value: invTotal ? num(invTotal) : r.priceSnapshot ? num(r.priceSnapshot) : null,
      currency: r.currency,
      invoiceStatus: invStatus,
      openItems,
      suppliedItems,
      parentId: r.parentRequestId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}

/** Everything the request detail page needs, in one round of queries. */
export async function requestDetail(id: string) {
  const [row] = await db
    .select({ r: serviceRequest, c: client })
    .from(serviceRequest)
    .leftJoin(client, eq(client.id, serviceRequest.clientId))
    .where(eq(serviceRequest.id, id))
    .limit(1);
  if (!row || row.r.deletedAt) return null;
  const r = row.r;
  const [events, documents, items, rounds, assignees, invoices, payments, related] = await Promise.all([
    db.select().from(serviceRequestEvent).where(eq(serviceRequestEvent.requestId, id)).orderBy(desc(serviceRequestEvent.createdAt)),
    db
      .select()
      .from(serviceRequestDocument)
      .where(and(eq(serviceRequestDocument.requestId, id), isNull(serviceRequestDocument.supersededById)))
      .orderBy(desc(serviceRequestDocument.createdAt)),
    db.select().from(requestItem).where(eq(requestItem.requestId, id)).orderBy(desc(requestItem.createdAt)),
    db.select().from(reviewRound).where(eq(reviewRound.requestId, id)).orderBy(desc(reviewRound.round)),
    db
      .select({ id: requestAssignment.id, userId: requestAssignment.userId, name: user.name, email: user.email, role: user.role, at: requestAssignment.createdAt })
      .from(requestAssignment)
      .leftJoin(user, eq(user.id, requestAssignment.userId))
      .where(eq(requestAssignment.requestId, id)),
    r.invoiceId
      ? db
          .select()
          .from(invoice)
          .where(and(isNull(invoice.deletedAt), or(eq(invoice.id, r.invoiceId), eq(invoice.parentInvoiceId, r.invoiceId))))
      : Promise.resolve([]),
    db
      .select()
      .from(payment)
      .where(r.invoiceId ? or(eq(payment.requestId, id), eq(payment.invoiceId, r.invoiceId)) : eq(payment.requestId, id))
      .orderBy(desc(payment.createdAt)),
    db
      .select({ id: serviceRequest.id, number: serviceRequest.number, service: serviceRequest.serviceName, status: serviceRequest.status, parentId: serviceRequest.parentRequestId })
      .from(serviceRequest)
      .where(
        and(
          isNull(serviceRequest.deletedAt),
          r.parentRequestId ? or(eq(serviceRequest.id, r.parentRequestId), eq(serviceRequest.parentRequestId, id)) : eq(serviceRequest.parentRequestId, id),
        ),
      ),
  ]);
  return {
    request: r,
    client: row.c,
    events,
    documents,
    items,
    rounds,
    assignees: assignees.map((a) => ({ ...a, name: a.name || a.email || "Team member" })),
    invoices,
    payments,
    parent: related.find((x) => x.id === r.parentRequestId) ?? null,
    followOns: related.filter((x) => x.parentId === id),
  };
}

export const isClosed = (status: string) => (TERMINAL_STATUSES as string[]).includes(status);
