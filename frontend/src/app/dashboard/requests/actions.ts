"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  invoice,
  serviceRequest,
  serviceRequestEvent,
  serviceRequestDocument,
} from "@/lib/db/schema";
import { getSessionUser } from "@/lib/server-user";
import { getClientForUser } from "@/lib/db/queries/clients";
import { nextRequestNumber } from "@/lib/db/queries/requests";
import { getCatalogService, type RequiredDocument } from "@/lib/services/catalog";
import { insertInvoiceWithItems } from "@/lib/invoice/persist";
import { initInvoicePayment } from "@/lib/payments/init";
import { canTransition } from "@/lib/requests/status";
import {
  emailRequestSubmitted,
  alertAdminNewRequest,
  alertAdminDocumentUploaded,
  alertAdminDocumentsComplete,
  emailRequestTerminal,
  alertAdminClientMessage,
} from "@/lib/emails/requests";
import { notifyAdmin } from "@/lib/notify";

type ActionResult = { ok: boolean; id?: string; payUrl?: string; error?: string };

async function requireClient() {
  const user = await getSessionUser();
  if (!user || user.role !== "client") return null;
  return user;
}

/** Load a request and verify the session user's client owns it. */
async function ownRequest(requestId: string) {
  const user = await requireClient();
  if (!user) return null;
  const clientRow = await getClientForUser(user.id, user.email, user.name);
  const [req] = await db
    .select()
    .from(serviceRequest)
    .where(and(eq(serviceRequest.id, requestId), eq(serviceRequest.clientId, clientRow.id)));
  if (!req) return null;
  return { user, clientRow, req };
}

function revalidateRequest(id?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/requests");
  if (id) revalidatePath(`/dashboard/requests/${id}`);
  revalidatePath("/admin/requests");
}

/**
 * Create a service request from the stepper. Fixed-price: atomically creates
 * the invoice too (status "sent" — issued the moment the client commits) and
 * returns a Paystack checkout URL. Quote: lands with the admin for scoping.
 */
export async function createRequestAction(input: {
  serviceSlug: string;
  details: string;
  intake?: Record<string, unknown>;
}): Promise<ActionResult> {
  const user = await requireClient();
  if (!user) return { ok: false, error: "Please sign in to request a service." };

  const service = await getCatalogService(input.serviceSlug);
  if (!service || !service.active) return { ok: false, error: "This service isn't available right now." };
  if (!input.details?.trim()) return { ok: false, error: "Tell us a little about what you need." };

  const clientRow = await getClientForUser(user.id, user.email, user.name);
  const number = await nextRequestNumber();
  const isFixed = service.pricingMode === "fixed" && service.priceNgn;

  const requestId = await db.transaction(async (tx) => {
    let invoiceId: string | null = null;
    if (isFixed) {
      const inv = await insertInvoiceWithItems(
        {
          status: "sent",
          clientId: clientRow.id,
          billTo: {
            name: clientRow.name,
            company: clientRow.company,
            email: clientRow.email || user.email,
            address: clientRow.address,
            taxId: clientRow.taxId,
          },
          projectTitle: service.name,
          currency: "NGN",
          dueDate: new Date().toISOString().slice(0, 10),
          items: [
            {
              description: service.name,
              detail: service.turnaround ? `Estimated turnaround: ${service.turnaround}` : null,
              quantity: 1,
              unitPrice: service.priceNgn!,
              taxRate: service.taxRate,
            },
          ],
          createdByUserId: user.id,
        },
        tx
      );
      invoiceId = inv.id;
    }

    const [row] = await tx
      .insert(serviceRequest)
      .values({
        number,
        clientId: clientRow.id,
        userId: user.id,
        serviceSlug: service.slug,
        serviceName: service.name,
        pricingMode: service.pricingMode,
        priceSnapshot: isFixed ? service.priceNgn : null,
        currency: "NGN",
        status: isFixed ? "pending_payment" : "quote_requested",
        details: input.details.trim(),
        intake: input.intake ?? null,
        requiredDocuments: service.requiredDocuments,
        stepLabels: service.stepLabels,
        invoiceId,
      })
      .returning({ id: serviceRequest.id });

    await tx.insert(serviceRequestEvent).values({
      requestId: row.id,
      type: "created",
      toStatus: isFixed ? "pending_payment" : "quote_requested",
      message: isFixed
        ? `Request submitted for ${service.name}.`
        : `Request submitted for ${service.name} — we'll send your quote within 2 business days.`,
      visibility: "client",
      actorRole: "client",
      actorName: clientRow.name,
    });
    return row.id;
  });

  const [req] = await db.select().from(serviceRequest).where(eq(serviceRequest.id, requestId));
  const clientEmail = clientRow.email || user.email;
  if (clientEmail) void emailRequestSubmitted(req, clientEmail, clientRow.name);
  void alertAdminNewRequest(req, clientRow.name);
  revalidateRequest(requestId);

  // Fixed-price: hand back the Paystack URL so the stepper redirects straight in.
  if (isFixed && req.invoiceId) {
    const [inv] = await db.select().from(invoice).where(eq(invoice.id, req.invoiceId));
    if (inv) {
      const init = await initInvoicePayment(inv, {
        requestId,
        email: clientEmail,
      });
      if (init.ok) return { ok: true, id: requestId, payUrl: init.url };
      // Payment init failed (e.g. Paystack down / unconfigured) — the request
      // exists; the workspace shows a "Complete payment" retry.
      return { ok: true, id: requestId, error: init.error };
    }
  }
  return { ok: true, id: requestId };
}

/** "Complete payment" on a pending request — mints a fresh checkout. */
export async function initRequestPaymentAction(requestId: string): Promise<ActionResult> {
  const owned = await ownRequest(requestId);
  if (!owned) return { ok: false, error: "Unauthorized" };
  const { req, clientRow, user } = owned;
  if (req.status !== "pending_payment" || !req.invoiceId) {
    return { ok: false, error: "This request isn't awaiting payment." };
  }
  const [inv] = await db.select().from(invoice).where(eq(invoice.id, req.invoiceId));
  if (!inv) return { ok: false, error: "Invoice not found." };
  const init = await initInvoicePayment(inv, {
    requestId,
    email: clientRow.email || user.email,
  });
  if (!init.ok) return { ok: false, error: init.error };
  return { ok: true, id: requestId, payUrl: init.url };
}

/** Cancel before payment (fixed) or withdraw a quote request. */
export async function cancelRequestAction(requestId: string, reason?: string): Promise<ActionResult> {
  const owned = await ownRequest(requestId);
  if (!owned) return { ok: false, error: "Unauthorized" };
  const { req, clientRow, user } = owned;
  if (!canTransition(req.status, "cancelled")) {
    return { ok: false, error: "This request can no longer be cancelled here — contact support instead." };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(serviceRequest)
      .set({ status: "cancelled", cancelReason: reason || null, updatedAt: new Date() })
      .where(eq(serviceRequest.id, requestId));
    await tx.insert(serviceRequestEvent).values({
      requestId,
      type: "cancelled",
      fromStatus: req.status,
      toStatus: "cancelled",
      message: reason ? `Cancelled by you: ${reason}` : "Cancelled by you.",
      visibility: "client",
      actorRole: "client",
      actorName: clientRow.name,
    });
    if (req.invoiceId) {
      await tx
        .update(invoice)
        .set({ status: "void", updatedAt: new Date() })
        .where(and(eq(invoice.id, req.invoiceId), eq(invoice.status, "sent")));
    }
  });

  const clientEmail = clientRow.email || user.email;
  if (clientEmail) void emailRequestTerminal(req, clientEmail, "cancelled", reason);
  void notifyAdmin({
    subject: `Request ${req.number} cancelled by client`,
    html: `<p><strong>${clientRow.name}</strong> cancelled <strong>${req.number}</strong> (${req.serviceName}).${reason ? ` Reason: ${reason}` : ""}</p>`,
  });
  revalidateRequest(requestId);
  return { ok: true, id: requestId };
}

/** Client declines the quote we sent (request sits at pending_payment, quote path). */
export async function declineQuoteRequestAction(requestId: string, reason: string): Promise<ActionResult> {
  const owned = await ownRequest(requestId);
  if (!owned) return { ok: false, error: "Unauthorized" };
  const { req, clientRow, user } = owned;
  const declinable =
    req.pricingMode === "quote" && ["quote_requested", "pending_payment"].includes(req.status);
  if (!declinable) return { ok: false, error: "There's no open quote to decline." };
  if (!reason?.trim()) return { ok: false, error: "Let us know why so we can do better." };

  await db.transaction(async (tx) => {
    await tx
      .update(serviceRequest)
      .set({ status: "declined", cancelReason: reason.trim(), updatedAt: new Date() })
      .where(eq(serviceRequest.id, requestId));
    await tx.insert(serviceRequestEvent).values({
      requestId,
      type: "declined",
      fromStatus: req.status,
      toStatus: "declined",
      message: `Quote declined: ${reason.trim()}`,
      visibility: "client",
      actorRole: "client",
      actorName: clientRow.name,
    });
    if (req.invoiceId) {
      await tx
        .update(invoice)
        .set({ status: "void", updatedAt: new Date() })
        .where(and(eq(invoice.id, req.invoiceId), eq(invoice.status, "sent")));
    }
  });

  const clientEmail = clientRow.email || user.email;
  if (clientEmail) void emailRequestTerminal(req, clientEmail, "declined", reason);
  void notifyAdmin({
    subject: `Quote declined on ${req.number}`,
    html: `<p><strong>${clientRow.name}</strong> declined the quote for <strong>${req.serviceName}</strong>. Reason: ${reason.trim()}</p>`,
  });
  revalidateRequest(requestId);
  return { ok: true, id: requestId };
}

/**
 * Record a completed upload against a checklist slot (the file itself goes to
 * the private bucket via the presigned PUT from /api/requests/[id]/docs).
 * Re-uploading a slot supersedes the previous file; filling the last required
 * slot auto-advances the request.
 */
export async function recordRequestDocumentAction(input: {
  requestId: string;
  checklistKey?: string | null;
  fileName: string;
  contentType?: string;
  sizeBytes: number;
  r2Key: string;
}): Promise<ActionResult> {
  const owned = await ownRequest(input.requestId);
  if (!owned) return { ok: false, error: "Unauthorized" };
  const { req, clientRow } = owned;
  if (!["awaiting_documents", "in_progress", "in_review"].includes(req.status)) {
    return { ok: false, error: "Uploads aren't open on this request." };
  }
  // Defence-in-depth: the presign route enforces this prefix.
  if (!input.r2Key.startsWith(`requests/${req.id}/`)) {
    return { ok: false, error: "Invalid upload key." };
  }

  await db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(serviceRequestDocument)
      .values({
        requestId: req.id,
        kind: "client_upload",
        checklistKey: input.checklistKey || null,
        fileName: input.fileName,
        contentType: input.contentType || null,
        sizeBytes: input.sizeBytes,
        r2Key: input.r2Key,
        uploadedByRole: "client",
        uploadedByName: clientRow.name,
      })
      .returning({ id: serviceRequestDocument.id });

    if (input.checklistKey) {
      // Supersede any previous current file in the same slot.
      const previous = await tx
        .select({ id: serviceRequestDocument.id })
        .from(serviceRequestDocument)
        .where(
          and(
            eq(serviceRequestDocument.requestId, req.id),
            eq(serviceRequestDocument.checklistKey, input.checklistKey),
            eq(serviceRequestDocument.kind, "client_upload"),
            isNull(serviceRequestDocument.supersededById)
          )
        );
      for (const p of previous) {
        if (p.id !== doc.id) {
          await tx
            .update(serviceRequestDocument)
            // Re-upload resolves any pending correction on the slot.
            .set({ supersededById: doc.id, correctionReason: null, correctionRequestedAt: null })
            .where(eq(serviceRequestDocument.id, p.id));
        }
      }
    }

    await tx.insert(serviceRequestEvent).values({
      requestId: req.id,
      type: "document_uploaded",
      message: `Uploaded ${input.fileName}.`,
      visibility: "client",
      actorRole: "client",
      actorName: clientRow.name,
    });
  });

  void alertAdminDocumentUploaded(req, input.fileName);

  // All required slots filled? Auto-advance awaiting_documents → in_progress.
  if (req.status === "awaiting_documents") {
    const required = ((req.requiredDocuments as RequiredDocument[]) ?? []).filter((d) => d.required);
    if (required.length) {
      const current = await db
        .select({ checklistKey: serviceRequestDocument.checklistKey })
        .from(serviceRequestDocument)
        .where(
          and(
            eq(serviceRequestDocument.requestId, req.id),
            eq(serviceRequestDocument.kind, "client_upload"),
            isNull(serviceRequestDocument.supersededById)
          )
        );
      const filled = new Set(current.map((d) => d.checklistKey).filter(Boolean));
      if (required.every((d) => filled.has(d.key))) {
        await db
          .update(serviceRequest)
          .set({ status: "in_progress", updatedAt: new Date() })
          .where(and(eq(serviceRequest.id, req.id), eq(serviceRequest.status, "awaiting_documents")));
        await db.insert(serviceRequestEvent).values([
          {
            requestId: req.id,
            type: "documents_complete",
            message: "All required documents received — thank you!",
            visibility: "client",
            actorRole: "system",
          },
          {
            requestId: req.id,
            type: "status_changed",
            fromStatus: "awaiting_documents",
            toStatus: "in_progress",
            message: "Work has started on your request.",
            visibility: "client",
            actorRole: "system",
          },
        ]);
        void alertAdminDocumentsComplete(req);
      }
    }
  }

  revalidateRequest(req.id);
  return { ok: true, id: req.id };
}

/** Client approves the delivered work and closes the request. */
export async function approveCloseRequestAction(requestId: string): Promise<ActionResult> {
  const owned = await ownRequest(requestId);
  if (!owned) return { ok: false, error: "Unauthorized" };
  const { req, clientRow } = owned;
  if (req.status !== "delivered") return { ok: false, error: "Nothing to approve yet." };

  await db.transaction(async (tx) => {
    await tx
      .update(serviceRequest)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(serviceRequest.id, requestId));
    await tx.insert(serviceRequestEvent).values({
      requestId,
      type: "status_changed",
      fromStatus: "delivered",
      toStatus: "completed",
      message: "You approved the deliverable — request completed. Thank you!",
      visibility: "client",
      actorRole: "client",
      actorName: clientRow.name,
    });
  });

  void notifyAdmin({
    subject: `✅ ${req.number} approved & closed by client`,
    html: `<p><strong>${clientRow.name}</strong> approved and closed <strong>${req.number}</strong> (${req.serviceName}).</p>`,
  });
  revalidateRequest(requestId);
  return { ok: true, id: requestId };
}

/**
 * Client reply on the request's message thread. Writes the same client-visible
 * "message" event the advisor's replies use, and alerts the admin by email.
 */
export async function postRequestMessageAction(
  requestId: string,
  body: string
): Promise<ActionResult> {
  const owned = await ownRequest(requestId);
  if (!owned) return { ok: false, error: "Not found" };
  const { req, clientRow } = owned;
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Write a message first." };
  if (trimmed.length > 4000) return { ok: false, error: "Message is too long." };

  await db.insert(serviceRequestEvent).values({
    requestId,
    type: "message",
    message: trimmed,
    visibility: "client",
    actorRole: "client",
    actorName: clientRow.name,
  });
  void alertAdminClientMessage(req, trimmed, clientRow.name);
  revalidateRequest(requestId);
  return { ok: true, id: requestId };
}
