import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
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
  ticket,
} from "@/lib/db/schema";
import { paymentLabel } from "@/lib/payments/amounts";
import { assigneesOf } from "@/lib/requests/people";

/**
 * Staff workspace reads. EVERY query starts from request_assignment for the
 * signed-in user, so a staff member only ever reads assigned requests. No
 * amount column is ever selected — payment is reduced to a label.
 */

export const assignedRequestIds = cache(async (userId: string): Promise<string[]> => {
  const rows = await db
    .select({ id: requestAssignment.requestId })
    .from(requestAssignment)
    .innerJoin(serviceRequest, eq(serviceRequest.id, requestAssignment.requestId))
    .where(and(eq(requestAssignment.userId, userId), isNull(serviceRequest.deletedAt)));
  return rows.map((r) => r.id);
});

/** Money-free invoice facts for a set of invoice ids. */
async function payFacts(invoiceIds: string[]) {
  if (!invoiceIds.length) return new Map<string, string>();
  const [invs, pend] = await Promise.all([
    db
      .select({ id: invoice.id, kind: invoice.kind, status: invoice.status, depositPercent: invoice.depositPercent })
      .from(invoice)
      .where(inArray(invoice.id, invoiceIds)),
    db
      .select({ invoiceId: payment.invoiceId })
      .from(payment)
      .where(and(inArray(payment.invoiceId, invoiceIds), eq(payment.provider, "bank_transfer"), eq(payment.status, "pending"))),
  ]);
  const pending = new Set(pend.map((p) => p.invoiceId));
  // paymentLabel never reads totals for these statuses; pass 0 so no amount is carried.
  return new Map(invs.map((i) => [i.id, paymentLabel({ ...i, total: 0 }, { proofPending: pending.has(i.id) })]));
}

const WAITING_ON_CLIENT = ["quote_sent", "pending_payment", "awaiting_documents", "client_review", "delivered"];

export async function staffRequestRows(userId: string) {
  const ids = await assignedRequestIds(userId);
  if (!ids.length) return [];
  const rows = await db
    .select({
      id: serviceRequest.id,
      number: serviceRequest.number,
      serviceName: serviceRequest.serviceName,
      status: serviceRequest.status,
      reviewRound: serviceRequest.reviewRound,
      invoiceId: serviceRequest.invoiceId,
      createdAt: serviceRequest.createdAt,
      updatedAt: serviceRequest.updatedAt,
      clientName: client.name,
      clientCompany: client.company,
    })
    .from(serviceRequest)
    .leftJoin(client, eq(client.id, serviceRequest.clientId))
    .where(inArray(serviceRequest.id, ids))
    .orderBy(desc(serviceRequest.updatedAt));
  const [pay, items] = await Promise.all([
    payFacts(rows.map((r) => r.invoiceId).filter((x): x is string => Boolean(x))),
    db
      .select({ requestId: requestItem.requestId, status: requestItem.status, dueAt: requestItem.dueAt })
      .from(requestItem)
      .where(and(inArray(requestItem.requestId, ids), inArray(requestItem.status, ["open", "supplied"]))),
  ]);
  return rows.map((r) => {
    const mine = items.filter((i) => i.requestId === r.id);
    const supplied = mine.filter((i) => i.status === "supplied").length;
    const open = mine.filter((i) => i.status === "open");
    const nextDue = open.map((i) => i.dueAt).filter((d): d is Date => Boolean(d)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    const terminal = ["completed", "cancelled", "declined", "refunded"].includes(r.status);
    const turn: "us" | "client" | "done" = terminal ? "done" : supplied > 0 || !WAITING_ON_CLIENT.includes(r.status) ? "us" : "client";
    return {
      ...r,
      client: r.clientCompany || r.clientName || "Client",
      payment: r.invoiceId ? pay.get(r.invoiceId) ?? "Not billed" : "Not billed",
      supplied,
      openAsks: open.length,
      nextDue: nextDue ? nextDue.toISOString() : null,
      turn,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}
export type StaffRequestRow = Awaited<ReturnType<typeof staffRequestRows>>[number];

/** One request for the staff page. Caller MUST have checked canWorkOnRequest(id). */
export async function staffRequestDetail(id: string) {
  const [row] = await db
    .select({
      id: serviceRequest.id,
      number: serviceRequest.number,
      serviceName: serviceRequest.serviceName,
      serviceSlug: serviceRequest.serviceSlug,
      status: serviceRequest.status,
      details: serviceRequest.details,
      intake: serviceRequest.intake,
      reviewRound: serviceRequest.reviewRound,
      invoiceId: serviceRequest.invoiceId,
      parentRequestId: serviceRequest.parentRequestId,
      createdAt: serviceRequest.createdAt,
      deliveredAt: serviceRequest.deliveredAt,
      clientId: serviceRequest.clientId,
      clientName: client.name,
      clientCompany: client.company,
      clientEmail: client.email,
      clientPhone: client.phone,
    })
    .from(serviceRequest)
    .leftJoin(client, eq(client.id, serviceRequest.clientId))
    .where(and(eq(serviceRequest.id, id), isNull(serviceRequest.deletedAt)));
  if (!row) return null;
  const [events, documents, items, rounds, pay, team, tickets] = await Promise.all([
    db.select().from(serviceRequestEvent).where(eq(serviceRequestEvent.requestId, id)).orderBy(desc(serviceRequestEvent.createdAt)),
    db
      .select()
      .from(serviceRequestDocument)
      .where(and(eq(serviceRequestDocument.requestId, id), isNull(serviceRequestDocument.supersededById)))
      .orderBy(desc(serviceRequestDocument.createdAt)),
    db.select().from(requestItem).where(and(eq(requestItem.requestId, id), ne(requestItem.status, "cancelled"))).orderBy(asc(requestItem.createdAt)),
    db.select().from(reviewRound).where(eq(reviewRound.requestId, id)).orderBy(desc(reviewRound.round)),
    row.invoiceId ? payFacts([row.invoiceId]) : Promise.resolve(new Map<string, string>()),
    assigneesOf([id]).then((m) => m.get(id) ?? []),
    db
      .select({ id: ticket.id, number: ticket.number, subject: ticket.subject, status: ticket.status, lastReplyAt: ticket.lastReplyAt })
      .from(ticket)
      .where(and(eq(ticket.requestId, id), isNull(ticket.deletedAt))),
  ]);
  // Strip anything financial from the event feed (payment events carry amounts).
  const safeEvents = events.map((e) =>
    e.type === "payment_received" || e.type === "invoice_linked"
      ? { ...e, message: e.type === "payment_received" ? "Payment received." : "Invoice issued." }
      : e,
  );
  return {
    request: { ...row, client: row.clientCompany || row.clientName || "Client" },
    events: safeEvents,
    documents,
    items,
    rounds,
    payment: row.invoiceId ? pay.get(row.invoiceId) ?? "Not billed" : "Not billed",
    team,
    tickets,
  };
}
export type StaffRequestDetail = NonNullable<Awaited<ReturnType<typeof staffRequestDetail>>>;

/**
 * Conversations on assigned requests: client "message" events and firm
 * "note" events (visibility client = reply the client sees; internal = team note).
 */
export async function staffThreads(userId: string) {
  const ids = await assignedRequestIds(userId);
  if (!ids.length) return [];
  const [reqs, msgs] = await Promise.all([
    db
      .select({ id: serviceRequest.id, number: serviceRequest.number, serviceName: serviceRequest.serviceName, status: serviceRequest.status, clientName: client.name, clientCompany: client.company })
      .from(serviceRequest)
      .leftJoin(client, eq(client.id, serviceRequest.clientId))
      .where(inArray(serviceRequest.id, ids)),
    db
      .select()
      .from(serviceRequestEvent)
      .where(and(inArray(serviceRequestEvent.requestId, ids), inArray(serviceRequestEvent.type, ["message", "note"])))
      .orderBy(asc(serviceRequestEvent.createdAt)),
  ]);
  return reqs
    .map((r) => {
      const thread = msgs.filter((m) => m.requestId === r.id);
      const last = thread[thread.length - 1] ?? null;
      const lastFirm = [...thread].reverse().find((m) => m.actorRole !== "client" && m.visibility === "client");
      const unanswered = thread.filter((m) => m.actorRole === "client" && (!lastFirm || m.createdAt > lastFirm.createdAt)).length;
      return {
        id: r.id,
        number: r.number,
        serviceName: r.serviceName,
        status: r.status,
        client: r.clientCompany || r.clientName || "Client",
        messages: thread.map((m) => ({ id: m.id, body: m.message ?? "", from: m.actorRole === "client" ? ("client" as const) : ("firm" as const), author: m.actorName, at: m.createdAt.toISOString(), internal: m.visibility === "internal" })),
        lastAt: last ? last.createdAt.toISOString() : null,
        unanswered,
      };
    })
    .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
}
export type StaffThread = Awaited<ReturnType<typeof staffThreads>>[number];

/** Files on assigned requests (the staff "Analyses" list). */
export async function staffFiles(userId: string) {
  const ids = await assignedRequestIds(userId);
  if (!ids.length) return [];
  return db
    .select({
      id: serviceRequestDocument.id,
      requestId: serviceRequestDocument.requestId,
      kind: serviceRequestDocument.kind,
      stage: serviceRequestDocument.stage,
      fileName: serviceRequestDocument.fileName,
      sizeBytes: serviceRequestDocument.sizeBytes,
      litchaiDocumentId: serviceRequestDocument.litchaiDocumentId,
      litchaiStatus: serviceRequestDocument.litchaiStatus,
      createdAt: serviceRequestDocument.createdAt,
      number: serviceRequest.number,
      serviceName: serviceRequest.serviceName,
      clientName: client.name,
      clientCompany: client.company,
    })
    .from(serviceRequestDocument)
    .innerJoin(serviceRequest, eq(serviceRequest.id, serviceRequestDocument.requestId))
    .leftJoin(client, eq(client.id, serviceRequest.clientId))
    .where(and(inArray(serviceRequestDocument.requestId, ids), isNull(serviceRequestDocument.supersededById)))
    .orderBy(desc(serviceRequestDocument.createdAt));
}
