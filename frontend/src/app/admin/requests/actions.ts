"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  client,
  invoice,
  serviceRequest,
  serviceRequestEvent,
  serviceRequestDocument,
} from "@/lib/db/schema";
import { isAdmin, getSessionUser } from "@/lib/server-user";
import { recordAudit } from "@/lib/audit";
import { canTransition, type RequestStatus } from "@/lib/requests/status";
import { markQuoteSent } from "@/lib/requests/quote";
import { emailStatusChanged, emailDeliverableReady, emailRequestTerminal } from "@/lib/emails/requests";

type ActionResult = { ok: boolean; error?: string };

async function requireAdmin() {
  return isAdmin();
}

async function loadRequest(id: string) {
  const [req] = await db.select().from(serviceRequest).where(eq(serviceRequest.id, id));
  return req ?? null;
}

/** Email on file for the request's client (their portal login/billing email). */
async function clientEmailFor(clientId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: client.email })
    .from(client)
    .where(eq(client.id, clientId));
  return row?.email ?? null;
}

function revalidateRequest(id: string) {
  revalidatePath("/admin/requests");
  revalidatePath(`/admin/requests/${id}`);
  revalidatePath("/admin");
  revalidatePath("/dashboard/requests");
  revalidatePath(`/dashboard/requests/${id}`);
  revalidatePath("/dashboard");
}

/**
 * Move a request to a new status (legal transitions only). The note travels
 * with the status email so the client always knows WHY something changed.
 * Terminal negatives (cancelled/declined/refunded) require a reason.
 */
export async function adminSetRequestStatusAction(
  requestId: string,
  toStatus: string,
  note?: string
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  const req = await loadRequest(requestId);
  if (!req) return { ok: false, error: "Not found" };
  if (!canTransition(req.status, toStatus)) {
    return { ok: false, error: `Can't move from ${req.status} to ${toStatus}.` };
  }
  const negative = ["cancelled", "declined", "refunded"].includes(toStatus);
  if (negative && !note?.trim()) {
    return { ok: false, error: "Add a short reason — the client sees it." };
  }

  const admin = await getSessionUser();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(serviceRequest)
      .set({
        status: toStatus,
        updatedAt: now,
        ...(toStatus === "delivered" ? { deliveredAt: now } : {}),
        ...(toStatus === "completed" ? { completedAt: now } : {}),
        ...(negative ? { cancelReason: note?.trim() || null } : {}),
      })
      .where(eq(serviceRequest.id, requestId));
    await tx.insert(serviceRequestEvent).values({
      requestId,
      type: negative ? (toStatus as "cancelled" | "declined" | "refunded") : "status_changed",
      fromStatus: req.status,
      toStatus,
      message: note?.trim() || null,
      visibility: "client",
      actorRole: "admin",
      actorName: admin?.name || "Litch Consulting",
    });
    // Voiding money on terminal negatives mirrors the client-side actions.
    if (negative && req.invoiceId && toStatus !== "refunded") {
      await tx
        .update(invoice)
        .set({ status: "void", updatedAt: now })
        .where(and(eq(invoice.id, req.invoiceId), eq(invoice.status, "sent")));
    }
    if (toStatus === "refunded" && req.invoiceId) {
      await tx
        .update(invoice)
        .set({ status: "refunded", updatedAt: now })
        .where(eq(invoice.id, req.invoiceId));
    }
  });

  await recordAudit({
    action: negative ? `request.${toStatus}` : "request.status_changed",
    entity: "request",
    entityId: requestId,
    meta: { number: req.number, from: req.status, to: toStatus, reason: negative ? note?.trim() : undefined },
  });

  const email = await clientEmailFor(req.clientId);
  if (email) {
    if (negative) {
      void emailRequestTerminal(req, email, toStatus as "cancelled" | "declined" | "refunded", note);
    } else {
      void emailStatusChanged(req, email, toStatus as RequestStatus, note);
    }
  }
  revalidateRequest(requestId);
  return { ok: true };
}

/** Add a note to the timeline — internal by default, or client-visible (emails them). */
export async function adminAddNoteAction(
  requestId: string,
  message: string,
  visibility: "internal" | "client"
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  const req = await loadRequest(requestId);
  if (!req) return { ok: false, error: "Not found" };
  if (!message.trim()) return { ok: false, error: "Write something first." };

  const admin = await getSessionUser();
  await db.insert(serviceRequestEvent).values({
    requestId,
    type: "note",
    message: message.trim(),
    visibility,
    actorRole: "admin",
    actorName: admin?.name || "Litch Consulting",
  });

  if (visibility === "client") {
    const email = await clientEmailFor(req.clientId);
    if (email) void emailStatusChanged(req, email, req.status as RequestStatus, message.trim());
  }
  revalidateRequest(requestId);
  return { ok: true };
}

export async function adminAssignRequestAction(
  requestId: string,
  assignee: string
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  await db
    .update(serviceRequest)
    .set({ assignee: assignee.trim() || null, updatedAt: new Date() })
    .where(eq(serviceRequest.id, requestId));
  revalidateRequest(requestId);
  return { ok: true };
}

/**
 * Record an uploaded deliverable (bytes already in the private bucket via the
 * presign route) and hand it to the client: doc row + event + status →
 * delivered + email. Previous deliverables stay downloadable as history.
 */
export async function adminRecordDeliverableAction(input: {
  requestId: string;
  fileName: string;
  contentType?: string;
  sizeBytes: number;
  r2Key: string;
  publishVariant?: "verified" | "manual_override";
}): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  const req = await loadRequest(input.requestId);
  if (!req) return { ok: false, error: "Not found" };
  if (!input.r2Key.startsWith(`requests/${req.id}/`)) {
    return { ok: false, error: "Invalid upload key." };
  }

  const admin = await getSessionUser();
  const now = new Date();
  const movesToDelivered = canTransition(req.status, "delivered");

  await db.transaction(async (tx) => {
    await tx.insert(serviceRequestDocument).values({
      requestId: req.id,
      kind: "deliverable",
      fileName: input.fileName,
      contentType: input.contentType || null,
      sizeBytes: input.sizeBytes,
      r2Key: input.r2Key,
      uploadedByRole: "admin",
      uploadedByName: admin?.name || "Litch Consulting",
      publishVariant: input.publishVariant ?? null,
    });
    await tx.insert(serviceRequestEvent).values({
      requestId: req.id,
      type: "deliverable_uploaded",
      message: `${input.fileName} is ready to download.`,
      visibility: "client",
      actorRole: "admin",
      actorName: admin?.name || "Litch Consulting",
    });
    if (movesToDelivered && req.status !== "delivered") {
      await tx
        .update(serviceRequest)
        .set({ status: "delivered", deliveredAt: now, updatedAt: now })
        .where(eq(serviceRequest.id, req.id));
      await tx.insert(serviceRequestEvent).values({
        requestId: req.id,
        type: "status_changed",
        fromStatus: req.status,
        toStatus: "delivered",
        message: "Your deliverable is ready — review and download it any time.",
        visibility: "client",
        actorRole: "admin",
        actorName: admin?.name || "Litch Consulting",
      });
    }
  });

  await recordAudit({
    action: "request.deliverable_published",
    entity: "request",
    entityId: req.id,
    meta: { number: req.number, fileName: input.fileName, variant: input.publishVariant ?? "upload" },
  });

  const email = await clientEmailFor(req.clientId);
  if (email) void emailDeliverableReady(req, email, input.fileName);
  revalidateRequest(req.id);
  return { ok: true };
}

/**
 * Link an existing invoice to a quote-based request by its number
 * (e.g. INV-2026-014). If the invoice has already been sent, the request
 * advances to pending_payment immediately.
 */
export async function adminLinkInvoiceAction(
  requestId: string,
  invoiceNumber: string
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  const req = await loadRequest(requestId);
  if (!req) return { ok: false, error: "Not found" };
  const [inv] = await db
    .select()
    .from(invoice)
    .where(eq(invoice.number, invoiceNumber.trim().toUpperCase()));
  if (!inv) return { ok: false, error: `No invoice found with number ${invoiceNumber.trim()}` };

  const admin = await getSessionUser();
  await db.transaction(async (tx) => {
    await tx
      .update(serviceRequest)
      .set({ invoiceId: inv.id, updatedAt: new Date() })
      .where(eq(serviceRequest.id, requestId));
    await tx.insert(serviceRequestEvent).values({
      requestId,
      type: "invoice_linked",
      message: `Linked ${inv.number} (${inv.currency} ${inv.total}).`,
      visibility: "internal",
      actorRole: "admin",
      actorName: admin?.name || "Litch Consulting",
    });
  });

  // Already-sent invoice → the quote is out; client can pay now.
  if (req.status === "quote_requested" && ["sent", "overdue"].includes(inv.status)) {
    await markQuoteSent(requestId, inv.number);
  }
  revalidateRequest(requestId);
  return { ok: true };
}

/* ---------------------- LitchAI bridge (Milestone 3) ---------------------- */

/**
 * Relay one client upload to the LitchAI pipeline: private-R2 bytes →
 * blind-relay encrypt → OCI API. Only ciphertext leaves this process (§12.6);
 * we store the returned document id and track its status on the doc row.
 */
export async function relayRequestDocumentAction(
  requestId: string,
  documentId: string
): Promise<ActionResult & { litchaiDocumentId?: string }> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  if (!process.env.LITCHAI_API_URL) return { ok: false, error: "LitchAI isn't configured yet." };

  const req = await loadRequest(requestId);
  if (!req) return { ok: false, error: "Not found" };
  const [doc] = await db
    .select()
    .from(serviceRequestDocument)
    .where(
      and(
        eq(serviceRequestDocument.id, documentId),
        eq(serviceRequestDocument.requestId, requestId),
        eq(serviceRequestDocument.kind, "client_upload")
      )
    );
  if (!doc) return { ok: false, error: "Document not found" };
  if (doc.litchaiDocumentId) {
    return { ok: true, litchaiDocumentId: doc.litchaiDocumentId };
  }

  try {
    const { getPrivateObject } = await import("@/lib/r2");
    const { postEncryptedDocument } = await import("@/lib/litchai/blind-relay");
    const plaintext = await getPrivateObject(doc.r2Key);
    const result = await postEncryptedDocument(plaintext, {
      clientId: req.clientId,
      filename: doc.fileName,
      mime: doc.contentType || "application/octet-stream",
    });
    // metadata only in logs — never file contents (§12.6)
    console.info("litchai.relay", {
      requestId,
      documentId,
      litchaiDocumentId: result.document_id,
      ciphertextSha256: result.ciphertextSha256,
      bytes: result.bytes,
      duplicate: result.duplicate,
    });

    const admin = await getSessionUser();
    await db
      .update(serviceRequestDocument)
      .set({ litchaiDocumentId: String(result.document_id), litchaiStatus: result.status || "queued" })
      .where(eq(serviceRequestDocument.id, doc.id));
    await db.insert(serviceRequestEvent).values({
      requestId,
      type: "ai_analysis_started",
      message: `${doc.fileName} sent for AI analysis.`,
      visibility: "internal",
      actorRole: "admin",
      actorName: admin?.name || "Litch Consulting",
    });
    revalidateRequest(requestId);
    return { ok: true, litchaiDocumentId: String(result.document_id) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Relay failed" };
  }
}

/** Refresh the pipeline status of every relayed doc on a request (poll-based, no webhook). */
export async function syncRequestAiStatusAction(
  requestId: string
): Promise<ActionResult & { statuses?: Record<string, string> }> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  if (!process.env.LITCHAI_API_URL) return { ok: false, error: "LitchAI isn't configured yet." };

  const docs = await db
    .select()
    .from(serviceRequestDocument)
    .where(eq(serviceRequestDocument.requestId, requestId));
  const relayed = docs.filter((d) => d.litchaiDocumentId);
  if (relayed.length === 0) return { ok: true, statuses: {} };

  const { getDocument } = await import("@/lib/litchai/client");
  const statuses: Record<string, string> = {};
  for (const doc of relayed) {
    try {
      const remote = await getDocument(Number(doc.litchaiDocumentId));
      statuses[doc.id] = remote.status;
      if (remote.status !== doc.litchaiStatus) {
        await db
          .update(serviceRequestDocument)
          .set({ litchaiStatus: remote.status })
          .where(eq(serviceRequestDocument.id, doc.id));
      }
    } catch (err) {
      statuses[doc.id] = doc.litchaiStatus || "unknown";
      console.error("litchai.sync failed", { documentId: doc.id, err });
    }
  }
  revalidateRequest(requestId);
  return { ok: true, statuses };
}

/**
 * Publish the gate-verified workbook as the request's deliverable: backend
 * result bytes → private R2 → deliverable row (variant "verified") →
 * delivered + client email. Manually-edited files go through the regular
 * deliverable upload instead (they'd be marked manual_override by the editor
 * flow when it ships).
 */
export async function publishVerifiedDeliverableAction(
  requestId: string,
  documentId: string
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  if (!process.env.LITCHAI_API_URL) return { ok: false, error: "LitchAI isn't configured yet." };

  const req = await loadRequest(requestId);
  if (!req) return { ok: false, error: "Not found" };
  const [doc] = await db
    .select()
    .from(serviceRequestDocument)
    .where(
      and(eq(serviceRequestDocument.id, documentId), eq(serviceRequestDocument.requestId, requestId))
    );
  if (!doc?.litchaiDocumentId) return { ok: false, error: "This document hasn't been analyzed." };

  try {
    const { getResultXlsx } = await import("@/lib/litchai/client");
    const { uploadPrivateObject } = await import("@/lib/r2");
    const bytes = await getResultXlsx(Number(doc.litchaiDocumentId));
    const fileName = doc.fileName.replace(/\.[^.]+$/, "") + " — compiled.xlsx";
    const r2Key = `requests/${req.id}/${Date.now()}-litchai-result.xlsx`;
    await uploadPrivateObject(
      r2Key,
      bytes,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    await db
      .update(serviceRequestDocument)
      .set({ litchaiStatus: "published" })
      .where(eq(serviceRequestDocument.id, doc.id));
    await db.insert(serviceRequestEvent).values({
      requestId,
      type: "ai_analysis_completed",
      message: `Verified workbook published from AI analysis (${doc.fileName}).`,
      visibility: "internal",
      actorRole: "admin",
    });
    // Reuse the deliverable pipeline: row + client event + delivered + email.
    return await adminRecordDeliverableAction({
      requestId,
      fileName,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: bytes.length,
      r2Key,
      publishVariant: "verified",
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Publish failed" };
  }
}

/** Delete a document (e.g. a wrong upload). Bytes stay in R2 history is fine — row goes. */
export async function adminDeleteRequestDocumentAction(
  requestId: string,
  documentId: string
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  await db
    .delete(serviceRequestDocument)
    .where(
      and(
        eq(serviceRequestDocument.id, documentId),
        eq(serviceRequestDocument.requestId, requestId),
        isNull(serviceRequestDocument.litchaiDocumentId) // never orphan an AI run
      )
    );
  revalidateRequest(requestId);
  return { ok: true };
}
