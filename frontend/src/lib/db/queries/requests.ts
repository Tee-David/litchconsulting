import "server-only";
import { and, desc, eq, inArray, isNull, like } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  serviceRequest,
  serviceRequestEvent,
  serviceRequestDocument,
  invoice,
  payment,
  consultation,
  client,
  type ServiceRequest,
  type ServiceRequestEvent,
  type ServiceRequestDocument,
  type Consultation,
} from "@/lib/db/schema";
import { ACTIVE_STATUSES, TERMINAL_STATUSES } from "@/lib/requests/status";

/** Next sequential number for the current year: REQ-YYYY-NNN. */
export async function nextRequestNumber(): Promise<string> {
  const prefix = `REQ-${new Date().getFullYear()}-`;
  const rows = await db
    .select({ number: serviceRequest.number })
    .from(serviceRequest)
    .where(like(serviceRequest.number, `${prefix}%`));
  let max = 0;
  for (const r of rows) {
    const n = parseInt(r.number.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

/* ----------------------------- client reads ----------------------------- */

export async function listClientRequests(clientId: string): Promise<ServiceRequest[]> {
  return db
    .select()
    .from(serviceRequest)
    .where(eq(serviceRequest.clientId, clientId))
    .orderBy(desc(serviceRequest.createdAt));
}

export async function listActiveClientRequests(clientId: string): Promise<ServiceRequest[]> {
  return db
    .select()
    .from(serviceRequest)
    .where(
      and(eq(serviceRequest.clientId, clientId), inArray(serviceRequest.status, ACTIVE_STATUSES))
    )
    .orderBy(desc(serviceRequest.createdAt));
}

/** Full request bundle, ownership-checked for the client portal. */
export async function getClientRequest(id: string, clientId: string) {
  const [req] = await db
    .select()
    .from(serviceRequest)
    .where(and(eq(serviceRequest.id, id), eq(serviceRequest.clientId, clientId)));
  if (!req) return null;
  return hydrateRequest(req, { includeInternal: false });
}

/* ------------------------------ admin reads ----------------------------- */

export async function listRequests(): Promise<ServiceRequest[]> {
  return db.select().from(serviceRequest).orderBy(desc(serviceRequest.createdAt));
}

export async function getRequest(id: string) {
  const [req] = await db.select().from(serviceRequest).where(eq(serviceRequest.id, id));
  if (!req) return null;
  return hydrateRequest(req, { includeInternal: true });
}

export async function requestStats() {
  const rows = await db
    .select({ status: serviceRequest.status })
    .from(serviceRequest);
  let open = 0;
  let pendingPayment = 0;
  let awaitingDocs = 0;
  let delivered = 0;
  for (const r of rows) {
    if (!TERMINAL_STATUSES.includes(r.status as (typeof TERMINAL_STATUSES)[number])) open++;
    if (r.status === "pending_payment" || r.status === "quote_requested") pendingPayment++;
    if (r.status === "awaiting_documents") awaitingDocs++;
    if (r.status === "delivered") delivered++;
  }
  return { total: rows.length, open, pendingPayment, awaitingDocs, delivered };
}

/* ------------------------------- hydration ------------------------------ */

export type RequestBundle = {
  request: ServiceRequest;
  events: ServiceRequestEvent[];
  documents: ServiceRequestDocument[]; // current versions only
  invoice: typeof invoice.$inferSelect | null;
  payments: (typeof payment.$inferSelect)[];
};

async function hydrateRequest(
  req: ServiceRequest,
  opts: { includeInternal: boolean }
): Promise<RequestBundle> {
  const [events, documents, invoiceRows, paymentRows] = await Promise.all([
    db
      .select()
      .from(serviceRequestEvent)
      .where(
        opts.includeInternal
          ? eq(serviceRequestEvent.requestId, req.id)
          : and(
              eq(serviceRequestEvent.requestId, req.id),
              eq(serviceRequestEvent.visibility, "client")
            )
      )
      .orderBy(desc(serviceRequestEvent.createdAt)),
    db
      .select()
      .from(serviceRequestDocument)
      .where(
        and(
          eq(serviceRequestDocument.requestId, req.id),
          isNull(serviceRequestDocument.supersededById)
        )
      )
      .orderBy(desc(serviceRequestDocument.createdAt)),
    req.invoiceId
      ? db.select().from(invoice).where(eq(invoice.id, req.invoiceId))
      : Promise.resolve([]),
    db
      .select()
      .from(payment)
      .where(eq(payment.requestId, req.id))
      .orderBy(desc(payment.createdAt)),
  ]);
  return {
    request: req,
    events,
    documents,
    invoice: invoiceRows[0] ?? null,
    payments: paymentRows,
  };
}

/** Payment history strip for the client Billing page. */
export async function listClientPayments(clientId: string) {
  return db
    .select()
    .from(payment)
    .where(eq(payment.clientId, clientId))
    .orderBy(desc(payment.createdAt));
}

/** Cal.com bookings, upcoming first (admin Consultations tab). */
export async function listConsultations(): Promise<Consultation[]> {
  return db.select().from(consultation).orderBy(desc(consultation.startsAt));
}

/** Requests list joined with the client's name for the admin table. */
export async function listRequestsWithClients() {
  return db
    .select({
      request: serviceRequest,
      clientName: client.name,
      clientCompany: client.company,
    })
    .from(serviceRequest)
    .leftJoin(client, eq(serviceRequest.clientId, client.id))
    .orderBy(desc(serviceRequest.createdAt));
}
