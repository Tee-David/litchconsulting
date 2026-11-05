import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { requestItem, serviceRequest, serviceRequestDocument, serviceRequestEvent } from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit";
import { notifyClient, notifyFirm } from "@/lib/requests/people";
import { templateEmail } from "@/lib/email-templates";

/**
 * Asks (request_item): info or document, open → supplied → received.
 * The firm asks (createItem / markItemReceived — callers check
 * canWorkOnRequest); the client answers (supplyItem — callers check ownership
 * by passing the client id, which is re-checked here).
 */

export async function createItem(input: {
  requestId: string;
  kind: "info" | "document";
  title: string;
  detail?: string;
  dueAt?: Date | null;
  actor: { userId: string; name: string };
}) {
  const [req] = await db.select().from(serviceRequest).where(and(eq(serviceRequest.id, input.requestId), isNull(serviceRequest.deletedAt)));
  if (!req) return { ok: false as const, error: "Request not found." };
  const [row] = await db
    .insert(requestItem)
    .values({ requestId: req.id, kind: input.kind, title: input.title.trim().slice(0, 200), detail: input.detail?.trim().slice(0, 2000) || null, dueAt: input.dueAt ?? null, createdBy: input.actor.userId })
    .returning({ id: requestItem.id });
  await db.insert(serviceRequestEvent).values({
    requestId: req.id,
    type: "item_requested",
    message: `We asked: ${input.title.trim()}`,
    visibility: "client",
    actorRole: "admin",
    actorName: input.actor.name,
  });
  const link = `/dashboard/requests/${req.id}/asks`;
  await notifyClient(req.clientId, {
    category: "actions",
    title: input.kind === "document" ? `Please upload: ${input.title.trim()}` : `Question: ${input.title.trim()}`,
    body: `${req.number} · ${req.serviceName}`,
    link,
    dedupeKey: `item-open:${row.id}`,
    email: templateEmail("actionNeeded", {
      senderName: input.actor.name,
      requestNumber: req.number,
      what: input.title.trim(),
      why: input.detail?.trim() || null,
      due: input.dueAt ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" }).format(input.dueAt) : null,
      url: link,
    }),
  });
  return { ok: true as const, id: row.id };
}

export async function supplyItem(input: {
  itemId: string;
  clientId: string;
  answer?: string;
  notAvailable?: boolean;
  document?: { fileName: string; contentType?: string | null; sizeBytes: number; r2Key: string };
  actor: { userId: string; name: string };
}) {
  const [row] = await db
    .select({ item: requestItem, req: serviceRequest })
    .from(requestItem)
    .innerJoin(serviceRequest, eq(serviceRequest.id, requestItem.requestId))
    .where(and(eq(requestItem.id, input.itemId), eq(serviceRequest.clientId, input.clientId), isNull(serviceRequest.deletedAt)));
  if (!row) return { ok: false as const, error: "We could not find that ask on your account." };
  const { item, req } = row;
  if (item.status !== "open") return { ok: false as const, error: "You already answered this one." };

  let answer = input.answer?.trim().slice(0, 4000) || null;
  if (input.notAvailable) answer = `I do not have this.${answer ? ` ${answer}` : ""}`;
  if (item.kind === "info" && !answer) return { ok: false as const, error: "Write an answer first." };
  if (item.kind === "document" && !input.document && !input.notAvailable) return { ok: false as const, error: "Upload the file first." };
  if (input.document && !input.document.r2Key.startsWith(`requests/${req.id}/`)) return { ok: false as const, error: "Upload the file again." };

  const now = new Date();
  await db.transaction(async (tx) => {
    let documentId: string | null = null;
    if (input.document) {
      const [doc] = await tx
        .insert(serviceRequestDocument)
        .values({
          requestId: req.id,
          kind: "client_upload",
          fileName: input.document.fileName.slice(0, 200),
          contentType: input.document.contentType ?? null,
          sizeBytes: input.document.sizeBytes,
          r2Key: input.document.r2Key,
          uploadedByRole: "client",
          uploadedByName: input.actor.name,
        })
        .returning({ id: serviceRequestDocument.id });
      documentId = doc.id;
    }
    await tx
      .update(requestItem)
      .set({ status: "supplied", answer, documentId: documentId ?? item.documentId, suppliedAt: now, updatedAt: now })
      .where(eq(requestItem.id, item.id));
    await tx.insert(serviceRequestEvent).values({
      requestId: req.id,
      type: input.document ? "document_uploaded" : "message",
      message: input.document ? `Sent ${input.document.fileName} for "${item.title}".` : `Answered "${item.title}": ${answer}`,
      visibility: "client",
      actorRole: "client",
      actorName: input.actor.name,
    });
  });
  await notifyFirm(req.id, {
    category: "actions",
    title: `${req.number}: client ${input.notAvailable ? "cannot supply" : "supplied"} "${item.title}"`,
    body: input.document ? input.document.fileName : answer ?? undefined,
    dedupeKey: `item-supplied:${item.id}`,
    staffLink: `/work/requests/${req.id}?tab=asks`,
  });
  return { ok: true as const };
}

export async function markItemReceived(itemId: string, actor: { userId: string; name: string }) {
  const [item] = await db.select().from(requestItem).where(eq(requestItem.id, itemId));
  if (!item) return { ok: false as const, error: "Not found." };
  if (item.status !== "supplied") return { ok: false as const, error: "Only supplied items can be marked received." };
  await db.update(requestItem).set({ status: "received", receivedAt: new Date(), updatedAt: new Date() }).where(and(eq(requestItem.id, itemId), eq(requestItem.status, "supplied")));
  await db.insert(serviceRequestEvent).values({ requestId: item.requestId, type: "item_received", message: `Received: ${item.title}. Thank you.`, visibility: "client", actorRole: "admin", actorName: actor.name });
  await recordAudit({ actorId: actor.userId, actorName: actor.name, action: "request_item.received", entity: "request_item", entityId: itemId });
  return { ok: true as const, requestId: item.requestId };
}

/** Undo for markItemReceived. */
export async function reopenItemSupplied(itemId: string) {
  await db.update(requestItem).set({ status: "supplied", receivedAt: null, updatedAt: new Date() }).where(and(eq(requestItem.id, itemId), eq(requestItem.status, "received")));
}
