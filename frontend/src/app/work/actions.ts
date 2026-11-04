"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { requestItem, serviceRequest, serviceRequestDocument, serviceRequestEvent } from "@/lib/db/schema";
import { canWorkOnRequest, getSessionUser } from "@/lib/server-user";
import { roleOf } from "@/lib/access";
import { createItem, markItemReceived, reopenItemSupplied } from "@/lib/requests/items";
import { sendDraftForReview } from "@/lib/requests/review";
import { notifyClient, simpleEmail } from "@/lib/requests/people";
import { recordAudit } from "@/lib/audit";

/**
 * Staff workspace actions. Every one re-checks canWorkOnRequest (admins: any
 * request; staff: only assigned ones). None reads or writes money.
 */

type Result = { ok: true; message?: string; undoId?: string } | { ok: false; error: string };
const uuid = z.string().uuid();

async function actor() {
  const u = await getSessionUser();
  if (!u || u.banned) return null;
  const role = roleOf(u);
  if (role !== "staff" && role !== "admin") return null;
  return { userId: u.id, name: u.name || u.email };
}

function revalidate(requestId: string) {
  revalidatePath("/work", "layout");
  revalidatePath(`/dashboard/requests/${requestId}`);
  revalidatePath(`/admin/requests/${requestId}`);
}

export async function replyAction(requestId: string, body: string, internal: boolean): Promise<Result> {
  const me = await actor();
  if (!me) return { ok: false, error: "Sign in again to continue." };
  if (!uuid.safeParse(requestId).success || !(await canWorkOnRequest(requestId))) return { ok: false, error: "You are not assigned to this request." };
  const text = String(body ?? "").trim();
  if (!text) return { ok: false, error: "Write a message first." };
  if (text.length > 4000) return { ok: false, error: "Keep it under 4,000 characters." };
  const [req] = await db.select().from(serviceRequest).where(and(eq(serviceRequest.id, requestId), isNull(serviceRequest.deletedAt)));
  if (!req) return { ok: false, error: "Request not found." };
  await db.insert(serviceRequestEvent).values({
    requestId,
    type: "note",
    message: text,
    visibility: internal ? "internal" : "client",
    actorRole: "admin",
    actorName: me.name,
  });
  if (!internal) {
    const link = `/dashboard/requests/${requestId}?tab=messages`;
    await notifyClient(req.clientId, {
      category: "support",
      title: `${me.name} replied on ${req.serviceName}`,
      body: text.slice(0, 200),
      link,
      dedupeKey: `firm-msg:${requestId}:${Date.now()}`,
      email: await simpleEmail({ subject: `New message on ${req.number}`, heading: `${me.name} wrote to you`, body: text.slice(0, 600), href: link, cta: "Reply" }),
    });
  }
  revalidate(requestId);
  return { ok: true };
}

const askSchema = z.object({
  requestId: z.string().uuid(),
  kind: z.enum(["info", "document"]),
  title: z.string().trim().min(3).max(200),
  detail: z.string().max(2000).optional(),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
});

export async function askClientAction(input: z.infer<typeof askSchema>): Promise<Result> {
  const me = await actor();
  if (!me) return { ok: false, error: "Sign in again to continue." };
  const parsed = askSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Give the ask a short title (at least 3 characters)." };
  if (!(await canWorkOnRequest(parsed.data.requestId))) return { ok: false, error: "You are not assigned to this request." };
  const r = await createItem({
    requestId: parsed.data.requestId,
    kind: parsed.data.kind,
    title: parsed.data.title,
    detail: parsed.data.detail,
    dueAt: parsed.data.dueAt ? new Date(`${parsed.data.dueAt}T17:00:00+01:00`) : null,
    actor: me,
  });
  if (!r.ok) return r;
  revalidate(parsed.data.requestId);
  return { ok: true, message: "Sent to the client by email and on their dashboard." };
}

export async function markReceivedAction(itemId: string): Promise<Result> {
  const me = await actor();
  if (!me) return { ok: false, error: "Sign in again to continue." };
  if (!uuid.safeParse(itemId).success) return { ok: false, error: "Not found." };
  const [it] = await db.select({ requestId: requestItem.requestId }).from(requestItem).where(eq(requestItem.id, itemId));
  if (!it || !(await canWorkOnRequest(it.requestId))) return { ok: false, error: "You are not assigned to this request." };
  const r = await markItemReceived(itemId, me);
  if (!r.ok) return r;
  revalidate(it.requestId);
  return { ok: true, message: "Marked received. The client can see it.", undoId: itemId };
}

export async function undoReceivedAction(itemId: string): Promise<Result> {
  const me = await actor();
  if (!me) return { ok: false, error: "Sign in again to continue." };
  const [it] = await db.select({ requestId: requestItem.requestId }).from(requestItem).where(eq(requestItem.id, itemId));
  if (!it || !(await canWorkOnRequest(it.requestId))) return { ok: false, error: "You are not assigned to this request." };
  await reopenItemSupplied(itemId);
  revalidate(it.requestId);
  return { ok: true };
}

const deliverableSchema = z.object({
  requestId: z.string().uuid(),
  key: z.string().min(1).max(500),
  fileName: z.string().min(1).max(200),
  contentType: z.string().max(200).nullable().optional(),
  sizeBytes: z.number().int().positive().max(25 * 1024 * 1024),
});

/** Record an uploaded draft/final file on the request (upload went to private R2 first). */
export async function recordDeliverableAction(input: z.infer<typeof deliverableSchema>): Promise<Result & { documentId?: string }> {
  const me = await actor();
  if (!me) return { ok: false, error: "Sign in again to continue." };
  const parsed = deliverableSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Upload the file again." };
  const d = parsed.data;
  if (!(await canWorkOnRequest(d.requestId))) return { ok: false, error: "You are not assigned to this request." };
  if (!d.key.startsWith(`requests/${d.requestId}/`)) return { ok: false, error: "Upload the file again." };
  const [doc] = await db
    .insert(serviceRequestDocument)
    .values({ requestId: d.requestId, kind: "deliverable", stage: "draft", fileName: d.fileName, contentType: d.contentType ?? null, sizeBytes: d.sizeBytes, r2Key: d.key, uploadedByRole: "admin", uploadedByName: me.name })
    .returning({ id: serviceRequestDocument.id });
  await db.insert(serviceRequestEvent).values({ requestId: d.requestId, type: "deliverable_uploaded", message: `${me.name} added ${d.fileName} (draft, not yet sent).`, visibility: "internal", actorRole: "admin", actorName: me.name });
  await recordAudit({ actorId: me.userId, actorName: me.name, action: "request.deliverable_added", entity: "service_request", entityId: d.requestId, meta: { documentId: doc.id } });
  revalidate(d.requestId);
  return { ok: true, documentId: doc.id, message: "File added. Send it to the client when ready." };
}

export async function sendDraftAction(requestId: string, documentId: string, note?: string): Promise<Result> {
  const me = await actor();
  if (!me) return { ok: false, error: "Sign in again to continue." };
  if (!uuid.safeParse(requestId).success || !uuid.safeParse(documentId).success) return { ok: false, error: "Not found." };
  if (!(await canWorkOnRequest(requestId))) return { ok: false, error: "You are not assigned to this request." };
  const r = await sendDraftForReview({ requestId, documentId, note: note?.trim().slice(0, 500), actor: me });
  if (!r.ok) return r;
  revalidate(requestId);
  return { ok: true, message: `Draft ${r.round} sent. The client was told by email and on their dashboard.` };
}

/** Bulk: remind clients about their open asks on the selected requests. */
export async function sendReminderAction(requestIds: string[]): Promise<Result> {
  const me = await actor();
  if (!me) return { ok: false, error: "Sign in again to continue." };
  const ids = z.array(z.string().uuid()).max(100).safeParse(requestIds);
  if (!ids.success || !ids.data.length) return { ok: false, error: "Select at least one request." };
  const allowed: string[] = [];
  for (const id of ids.data) if (await canWorkOnRequest(id)) allowed.push(id);
  if (!allowed.length) return { ok: false, error: "You are not assigned to those requests." };
  const reqs = await db.select().from(serviceRequest).where(and(inArray(serviceRequest.id, allowed), isNull(serviceRequest.deletedAt)));
  const open = await db.select().from(requestItem).where(and(inArray(requestItem.requestId, allowed), eq(requestItem.status, "open")));
  let sent = 0;
  const day = new Date().toISOString().slice(0, 10);
  for (const r of reqs) {
    const mine = open.filter((i) => i.requestId === r.id);
    if (!mine.length && !["quote_sent", "pending_payment", "awaiting_documents", "client_review"].includes(r.status)) continue;
    const link = mine.length ? `/dashboard/requests/${r.id}/asks` : `/dashboard/requests/${r.id}`;
    const what = mine.length ? mine.map((i) => i.title).join(", ") : "your next step on this request";
    await notifyClient(r.clientId, {
      category: "actions",
      title: `Reminder: ${r.serviceName}`,
      body: `We are waiting on ${what}.`,
      link,
      dedupeKey: `reminder:${r.id}:${day}`,
      email: await simpleEmail({ subject: `A reminder about ${r.number}`, heading: "A quick reminder", body: `${me.name} is waiting on ${what} to carry on with ${r.serviceName}.`, href: link, cta: "Open" }),
    });
    sent++;
  }
  if (!sent) return { ok: false, error: "None of those requests is waiting on the client." };
  return { ok: true, message: `Reminder sent on ${sent} ${sent === 1 ? "request" : "requests"}.` };
}
