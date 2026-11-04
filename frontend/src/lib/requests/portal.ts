import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  invoice,
  payment,
  requestItem,
  reviewRound,
  serviceRequest,
  serviceRequestDocument,
  serviceRequestEvent,
  ticket,
} from "@/lib/db/schema";
import { getSessionUser } from "@/lib/server-user";
import { getClientForUser } from "@/lib/db/queries/clients";
import { roleOf } from "@/lib/access";
import { assigneesOf } from "@/lib/requests/people";

/**
 * Client-portal reads. Every function takes the client id resolved from the
 * session (never from the URL) and filters on it, so a client can only ever
 * read their own rows. Soft-deleted rows are excluded.
 */

/** Session user + their client row, deduped per request. Null when not a client. */
export const getPortal = cache(async () => {
  const user = await getSessionUser();
  if (!user || user.banned || roleOf(user) !== "client") return null;
  const clientRow = await getClientForUser(user.id, user.email || "", user.name || undefined);
  return { user, client: clientRow };
});

export async function clientRequestRows(clientId: string) {
  const rows = await db
    .select({
      id: serviceRequest.id,
      number: serviceRequest.number,
      serviceName: serviceRequest.serviceName,
      serviceSlug: serviceRequest.serviceSlug,
      pricingMode: serviceRequest.pricingMode,
      status: serviceRequest.status,
      reviewRound: serviceRequest.reviewRound,
      createdAt: serviceRequest.createdAt,
      updatedAt: serviceRequest.updatedAt,
      parentRequestId: serviceRequest.parentRequestId,
      invoiceId: serviceRequest.invoiceId,
      invoiceKind: invoice.kind,
      invoiceStatus: invoice.status,
      invoiceNumber: invoice.number,
    })
    .from(serviceRequest)
    .leftJoin(invoice, eq(invoice.id, serviceRequest.invoiceId))
    .where(and(eq(serviceRequest.clientId, clientId), isNull(serviceRequest.deletedAt)))
    .orderBy(desc(serviceRequest.createdAt));
  const team = await assigneesOf(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, team: team.get(r.id) ?? [] }));
}
export type ClientRequestRow = Awaited<ReturnType<typeof clientRequestRows>>[number];

export async function clientRequestDetail(id: string, clientId: string) {
  const [req] = await db
    .select()
    .from(serviceRequest)
    .where(and(eq(serviceRequest.id, id), eq(serviceRequest.clientId, clientId), isNull(serviceRequest.deletedAt)));
  if (!req) return null;
  const [events, documents, items, rounds, inv, team, parent, payments] = await Promise.all([
    db
      .select()
      .from(serviceRequestEvent)
      .where(and(eq(serviceRequestEvent.requestId, req.id), eq(serviceRequestEvent.visibility, "client")))
      .orderBy(desc(serviceRequestEvent.createdAt)),
    db
      .select()
      .from(serviceRequestDocument)
      .where(and(eq(serviceRequestDocument.requestId, req.id), isNull(serviceRequestDocument.supersededById)))
      .orderBy(desc(serviceRequestDocument.createdAt)),
    db
      .select()
      .from(requestItem)
      .where(and(eq(requestItem.requestId, req.id), ne(requestItem.status, "cancelled")))
      .orderBy(asc(requestItem.createdAt)),
    db.select().from(reviewRound).where(eq(reviewRound.requestId, req.id)).orderBy(desc(reviewRound.round)),
    req.invoiceId ? db.select().from(invoice).where(and(eq(invoice.id, req.invoiceId), isNull(invoice.deletedAt))).then((r) => r[0] ?? null) : Promise.resolve(null),
    assigneesOf([req.id]).then((m) => m.get(req.id) ?? []),
    req.parentRequestId
      ? db.select({ id: serviceRequest.id, number: serviceRequest.number, serviceName: serviceRequest.serviceName }).from(serviceRequest).where(and(eq(serviceRequest.id, req.parentRequestId), eq(serviceRequest.clientId, clientId))).then((r) => r[0] ?? null)
      : Promise.resolve(null),
    db.select().from(payment).where(eq(payment.requestId, req.id)).orderBy(desc(payment.createdAt)),
  ]);
  // The quote this request was priced with: the linked doc while it is a
  // quote, or (after acceptance) the latest accepted quote for the client that
  // the event feed mentions — we only need it for display.
  const quote = inv?.kind === "quote" ? inv : null;
  const bill = inv?.kind === "invoice" ? inv : null;
  return { request: req, events, documents, items, rounds, quote, invoice: bill, team, parent, payments };
}
export type ClientRequestDetail = NonNullable<Awaited<ReturnType<typeof clientRequestDetail>>>;

/** Every file on every request of the client, newest first. */
export async function clientFiles(clientId: string) {
  return db
    .select({
      id: serviceRequestDocument.id,
      requestId: serviceRequestDocument.requestId,
      kind: serviceRequestDocument.kind,
      stage: serviceRequestDocument.stage,
      fileName: serviceRequestDocument.fileName,
      sizeBytes: serviceRequestDocument.sizeBytes,
      scanStatus: serviceRequestDocument.scanStatus,
      createdAt: serviceRequestDocument.createdAt,
      requestNumber: serviceRequest.number,
      serviceName: serviceRequest.serviceName,
      serviceSlug: serviceRequest.serviceSlug,
      requestStatus: serviceRequest.status,
    })
    .from(serviceRequestDocument)
    .innerJoin(serviceRequest, eq(serviceRequest.id, serviceRequestDocument.requestId))
    .where(and(eq(serviceRequest.clientId, clientId), isNull(serviceRequest.deletedAt), isNull(serviceRequestDocument.supersededById)))
    .orderBy(desc(serviceRequestDocument.createdAt));
}
export type ClientFile = Awaited<ReturnType<typeof clientFiles>>[number];

/** Invoices and quotes the client can see (never drafts), plus transfer proofs pending. */
export async function clientBilling(clientId: string) {
  const docs = await db
    .select()
    .from(invoice)
    .where(and(eq(invoice.clientId, clientId), isNull(invoice.deletedAt), ne(invoice.status, "draft")))
    .orderBy(desc(invoice.createdAt));
  const ids = docs.map((d) => d.id);
  const pending = ids.length
    ? await db
        .select({ invoiceId: payment.invoiceId, amount: payment.amount, createdAt: payment.createdAt })
        .from(payment)
        .where(and(inArray(payment.invoiceId, ids), eq(payment.provider, "bank_transfer"), eq(payment.status, "pending")))
    : [];
  const reqs = ids.length
    ? await db
        .select({ id: serviceRequest.id, invoiceId: serviceRequest.invoiceId, number: serviceRequest.number })
        .from(serviceRequest)
        .where(and(inArray(serviceRequest.invoiceId, ids), isNull(serviceRequest.deletedAt)))
    : [];
  return {
    invoices: docs.filter((d) => d.kind === "invoice"),
    quotes: docs.filter((d) => d.kind === "quote"),
    pendingTransfers: new Map(pending.map((p) => [p.invoiceId, p])),
    requestByInvoice: new Map(reqs.map((r) => [r.invoiceId!, r])),
  };
}

/** Client tickets waiting on the client (for the attention list). */
export async function clientTicketsWaiting(clientId: string) {
  return db
    .select({ id: ticket.id, number: ticket.number, subject: ticket.subject, lastReplyAt: ticket.lastReplyAt })
    .from(ticket)
    .where(and(eq(ticket.clientId, clientId), isNull(ticket.deletedAt), eq(ticket.status, "pending")));
}
