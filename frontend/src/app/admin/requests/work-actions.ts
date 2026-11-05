"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import {
  requestAssignment,
  requestItem,
  reviewRound,
  serviceRequest,
  serviceRequestDocument,
  serviceRequestEvent,
  user,
} from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notifications";
import { canTransition, STATUS_LABELS, type RequestStatus } from "@/lib/requests/status";
import { actor, DENIED, failure } from "../_lib/guard";

import { templateEmail } from "@/lib/email-templates";
import { adminSetRequestStatusAction } from "./actions";
import { createItem, markItemReceived, reopenItemSupplied } from "@/lib/requests/items";
import { sendDraftForReview } from "@/lib/requests/review";

/*
 * Request work (R2.2): assignment, asks (request_item), deliverables with a
 * draft/final stage, client review rounds, bulk status and Trash. Every action
 * re-checks access on the server, validates with zod, audit-logs, and tells
 * the people involved through notifyUsers.
 */

type Res = { ok: true; message: string; undoId?: string } | { ok: false; error: string };
const uuid = z.string().uuid();

function touch(ids: string[]) {
  revalidatePath("/admin/requests");
  revalidatePath("/admin");
  for (const id of ids) {
    revalidatePath(`/admin/requests/${id}`);
    revalidatePath(`/dashboard/requests/${id}`);
  }
}

async function loadReq(id: string) {
  const [r] = await db.select().from(serviceRequest).where(eq(serviceRequest.id, id)).limit(1);
  return r && !r.deletedAt ? r : null;
}

/* ─────────────────────────────── assignment ─────────────────────────────── */

const assignSchema = z.object({ requestIds: z.array(uuid).min(1).max(200), userIds: z.array(z.string().min(1)).min(1).max(10), mode: z.enum(["add", "replace"]) });

/**
 * Assign team members to requests (bulk-safe). New assignees are told; with
 * "replace", people not in the list lose the request (and with it, staff
 * access to it).
 */
export async function assignRequestsAction(input: z.infer<typeof assignSchema>): Promise<Res> {
  const me = await actor("requestsAll");
  if (!me) return DENIED;
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose at least one person and one request." };
  const { requestIds, userIds, mode } = parsed.data;
  try {
    const people = await db.select({ id: user.id, name: user.name, email: user.email, role: user.role }).from(user).where(inArray(user.id, userIds));
    const valid = people.filter((p) => p.role === "admin" || p.role === "staff");
    if (!valid.length) return { ok: false, error: "Only admins and staff can be assigned." };
    const reqs = await db.select().from(serviceRequest).where(inArray(serviceRequest.id, requestIds));
    const added: Array<{ requestId: string; userId: string }> = [];
    for (const r of reqs) {
      if (mode === "replace") {
        await db.delete(requestAssignment).where(and(eq(requestAssignment.requestId, r.id), notInArray(requestAssignment.userId, valid.map((v) => v.id))));
      }
      const rows = await db
        .insert(requestAssignment)
        .values(valid.map((v) => ({ requestId: r.id, userId: v.id, assignedBy: me.id })))
        .onConflictDoNothing()
        .returning({ requestId: requestAssignment.requestId, userId: requestAssignment.userId });
      added.push(...rows);
      const names = (await db.select({ name: user.name, email: user.email }).from(requestAssignment).innerJoin(user, eq(user.id, requestAssignment.userId)).where(eq(requestAssignment.requestId, r.id))).map((n) => n.name || n.email);
      await db.update(serviceRequest).set({ assignee: names.join(", ") || null, updatedAt: new Date() }).where(eq(serviceRequest.id, r.id));
      await db.insert(serviceRequestEvent).values({
        requestId: r.id,
        type: "note",
        message: `Assigned to ${names.join(", ")}.`,
        visibility: "internal",
        actorRole: "admin",
        actorName: me.displayName,
      });
    }
    // Tell each newly assigned person once, with every request they got.
    for (const v of valid) {
      if (v.id === me.id) continue;
      const theirs = reqs.filter((r) => added.some((a) => a.requestId === r.id && a.userId === v.id));
      if (!theirs.length) continue;
      const one = theirs[0];
      await notifyUsers({
        userIds: [v.id],
        category: "team",
        title: theirs.length === 1 ? `${me.displayName} assigned you ${one.number}` : `${me.displayName} assigned you ${theirs.length} requests`,
        body: theirs.map((t) => `${t.number} · ${t.serviceName}`).join("\n"),
        link: v.role === "staff" ? (theirs.length === 1 ? `/work/requests/${one.id}` : "/work") : theirs.length === 1 ? `/admin/requests/${one.id}` : "/admin/requests",
        dedupeKey: `assigned:${v.id}:${theirs.map((t) => t.id).sort().join(",")}:${Date.now()}`,
        email: templateEmail(
          "assigned",
          {
            name: v.name,
            assignerName: me.displayName,
            requests: theirs.map((t) => ({ number: t.number, service: t.serviceName })),
            url: v.role === "staff" ? (theirs.length === 1 ? `/work/requests/${one.id}` : "/work") : "/admin/requests",
          },
          { recipientUserId: v.id, audience: v.role === "staff" ? "staff" : "admin" },
        ),
      });
    }
    await recordAudit({ action: "request.assigned", entity: "request", meta: { requests: reqs.map((r) => r.number), to: valid.map((v) => v.name || v.email), mode } });
    touch(reqs.map((r) => r.id));
    return { ok: true, message: `Assigned ${reqs.length} ${reqs.length === 1 ? "request" : "requests"} to ${valid.map((v) => (v.name || v.email).split(" ")[0]).join(", ")}.` };
  } catch (e) {
    return failure(e, "The assignment did not save. Try again.");
  }
}

export async function unassignAction(requestId: string, userId: string): Promise<Res> {
  const me = await actor("requestsAll");
  if (!me) return DENIED;
  if (!uuid.safeParse(requestId).success) return { ok: false, error: "Unknown request." };
  try {
    await db.delete(requestAssignment).where(and(eq(requestAssignment.requestId, requestId), eq(requestAssignment.userId, userId)));
    const names = (await db.select({ name: user.name, email: user.email }).from(requestAssignment).innerJoin(user, eq(user.id, requestAssignment.userId)).where(eq(requestAssignment.requestId, requestId))).map((n) => n.name || n.email);
    await db.update(serviceRequest).set({ assignee: names.join(", ") || null, updatedAt: new Date() }).where(eq(serviceRequest.id, requestId));
    await recordAudit({ action: "request.unassigned", entity: "request", entityId: requestId, meta: { userId } });
    touch([requestId]);
    return { ok: true, message: "Removed from this request." };
  } catch (e) {
    return failure(e);
  }
}

/* ─────────────────────────────── status / trash ─────────────────────────────── */

const bulkStatusSchema = z.object({ ids: z.array(uuid).min(1).max(200), to: z.string(), note: z.string().max(1000).optional() });

/** Move many requests at once. Only a status every selected request can legally reach is accepted. */
export async function bulkStatusAction(input: z.infer<typeof bulkStatusSchema>): Promise<Res> {
  const me = await actor("requestsAll");
  if (!me) return DENIED;
  const parsed = bulkStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose requests and a status." };
  const { ids, to, note } = parsed.data;
  const rows = await db.select({ id: serviceRequest.id, status: serviceRequest.status, number: serviceRequest.number }).from(serviceRequest).where(inArray(serviceRequest.id, ids));
  const illegal = rows.filter((r) => !canTransition(r.status, to));
  if (illegal.length) return { ok: false, error: `${illegal[0].number} cannot move to ${STATUS_LABELS[to as RequestStatus] ?? to}.` };
  let moved = 0;
  for (const r of rows) {
    const res = await adminSetRequestStatusAction(r.id, to, note);
    if (!res.ok) return { ok: false, error: `${r.number}: ${res.error}${moved ? ` (${moved} moved before it)` : ""}` };
    moved++;
  }
  return { ok: true, message: `Moved ${moved} to ${STATUS_LABELS[to as RequestStatus] ?? to}. Clients were emailed.` };
}

/** Move requests to Trash (soft delete, restorable for 30 days). Undo restores. */
export async function trashRequestsAction(ids: string[]): Promise<Res> {
  const me = await actor("trash");
  if (!me) return DENIED;
  const parsed = z.array(uuid).min(1).max(200).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Select up to 200 requests." };
  await db.update(serviceRequest).set({ deletedAt: new Date() }).where(inArray(serviceRequest.id, parsed.data));
  await recordAudit({ action: "request.trashed", entity: "request", meta: { count: parsed.data.length, ids: parsed.data } });
  touch([]);
  revalidatePath("/admin/trash");
  return { ok: true, message: `${parsed.data.length} moved to Trash.`, undoId: parsed.data.join(",") };
}

export async function restoreRequestsAction(idsCsv: string): Promise<Res> {
  const me = await actor("trash");
  if (!me) return DENIED;
  const parsed = z.array(uuid).min(1).max(200).safeParse(idsCsv.split(","));
  if (!parsed.success) return { ok: false, error: "Nothing to restore." };
  await db.update(serviceRequest).set({ deletedAt: null }).where(inArray(serviceRequest.id, parsed.data));
  await recordAudit({ action: "request.restored", entity: "request", meta: { count: parsed.data.length } });
  touch([]);
  revalidatePath("/admin/trash");
  return { ok: true, message: "Restored." };
}

/* ─────────────────────────────── asks (request_item) ─────────────────────────────── */

const askSchema = z.object({
  requestId: uuid,
  kind: z.enum(["document", "info"]),
  title: z.string().trim().min(3).max(200),
  detail: z.string().trim().max(2000).optional(),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
});

/** Ask the client for a document or a piece of information. They get a bell, email and push. */
export async function createAskAction(input: z.infer<typeof askSchema>): Promise<Res> {
  const me = await actor("requests");
  if (!me) return DENIED;
  const parsed = askSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Say what you need in at least a few words." };
  const { requestId, kind, title, detail, dueAt } = parsed.data;
  const { canWorkOnRequest } = await import("@/lib/server-user");
  if (!(await canWorkOnRequest(requestId))) return DENIED;
  try {
    const r = await createItem({
      requestId,
      kind,
      title,
      detail,
      dueAt: dueAt ? new Date(`${dueAt}T17:00:00+01:00`) : null,
      actor: { userId: me.id, name: me.displayName },
    });
    if (!r.ok) return { ok: false, error: r.error };
    await recordAudit({ action: "request.item_created", entity: "request", entityId: requestId, meta: { kind, title } });
    touch([requestId]);
    return { ok: true, message: `Ask sent. The client sees “${title}” on their Home.` };
  } catch (e) {
    return failure(e, "The ask was not sent. Try again.");
  }
}

const itemStatusSchema = z.object({ itemId: uuid, status: z.enum(["open", "received", "cancelled"]) });

/** Mark an ask received, re-open it (not good enough), or cancel it. */
export async function setAskStatusAction(input: z.infer<typeof itemStatusSchema>): Promise<Res> {
  const me = await actor("requests");
  if (!me) return DENIED;
  const parsed = itemStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Unknown ask." };
  const [it] = await db.select().from(requestItem).where(eq(requestItem.id, parsed.data.itemId)).limit(1);
  if (!it) return { ok: false, error: "This ask no longer exists." };
  const { canWorkOnRequest } = await import("@/lib/server-user");
  if (!(await canWorkOnRequest(it.requestId))) return DENIED;
  const to = parsed.data.status;
  const prev = it.status;
  if (to === "received") {
    const r = await markItemReceived(it.id, { userId: me.id, name: me.displayName });
    if (!r.ok) return { ok: false, error: r.error };
    touch([it.requestId]);
    return { ok: true, message: "Marked received. The client sees it ticked.", undoId: `${it.id}:${prev}` };
  }
  await db
    .update(requestItem)
    .set({ status: to, receivedAt: null, updatedAt: new Date() })
    .where(eq(requestItem.id, it.id));
  if (to !== prev) {
    await db.insert(serviceRequestEvent).values({
      requestId: it.requestId,
      type: "note",
      message: to === "cancelled" ? `No longer needed: ${it.title}` : `Asked again: ${it.title}`,
      visibility: "client",
      actorRole: "admin",
      actorName: me.displayName,
    });
    if (to === "open") {
      const r = await loadReq(it.requestId);
      if (r)
        await notifyUsers({
          userIds: [r.userId],
          category: "actions",
          title: `We need ${it.title} again`,
          body: "What you sent did not cover it. Please send it again.",
          link: `/dashboard/requests/${r.id}`,
          dedupeKey: `ask-reopen:${it.id}:${Date.now()}`,
        });
    }
  }
  touch([it.requestId]);
  return {
    ok: true,
    message: to === "cancelled" ? "Ask cancelled." : "Re-opened. The client was asked again.",
    undoId: `${it.id}:${prev}`,
  };
}

export async function undoAskStatusAction(undoId: string): Promise<Res> {
  const me = await actor("requests");
  if (!me) return DENIED;
  const [id, prev] = undoId.split(":");
  if (!uuid.safeParse(id).success || !["open", "supplied", "received", "cancelled"].includes(prev)) return { ok: false, error: "Nothing to undo." };
  const [it] = await db.select().from(requestItem).where(eq(requestItem.id, id)).limit(1);
  if (!it) return { ok: false, error: "Nothing to undo." };
  if (it.status === "received" && prev === "supplied") {
    await reopenItemSupplied(id);
    touch([it.requestId]);
    return { ok: true, message: "Undone." };
  }
  await db.update(requestItem).set({ status: prev, receivedAt: prev === "received" ? it.receivedAt ?? new Date() : null, updatedAt: new Date() }).where(eq(requestItem.id, id));
  touch([it.requestId]);
  return { ok: true, message: "Undone." };
}

/** Send a reminder about an open ask (once a day). */
export async function remindAskAction(itemId: string): Promise<Res> {
  const me = await actor("requests");
  if (!me) return DENIED;
  if (!uuid.safeParse(itemId).success) return { ok: false, error: "Unknown ask." };
  const [it] = await db.select().from(requestItem).where(eq(requestItem.id, itemId)).limit(1);
  if (!it || it.status !== "open") return { ok: false, error: "Only open asks can be reminded." };
  const r = await loadReq(it.requestId);
  if (!r) return { ok: false, error: "This request no longer exists." };
  await notifyUsers({
    userIds: [r.userId],
    category: "actions",
    title: `Reminder: ${it.title}`,
    body: `Still needed for ${r.serviceName}${it.dueAt ? `, due ${it.dueAt.toISOString().slice(0, 10)}` : ""}.`,
    link: `/dashboard/requests/${r.id}`,
    dedupeKey: `ask-remind:${it.id}:${new Date().toISOString().slice(0, 10)}`,
    email: templateEmail(
      "actionNeeded",
      {
        requestNumber: r.number,
        what: it.title,
        why: `A reminder: we still need this to carry on with ${r.serviceName}.`,
        due: it.dueAt ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" }).format(it.dueAt) : null,
        url: `/dashboard/requests/${r.id}/asks`,
      },
      { recipientUserId: r.userId },
    ),
  });
  return { ok: true, message: "Reminder sent." };
}

/* ─────────────────────────────── deliverables ─────────────────────────────── */

const deliverableSchema = z.object({
  requestId: uuid,
  fileName: z.string().min(1).max(255),
  contentType: z.string().max(200).optional(),
  sizeBytes: z.number().int().nonnegative(),
  r2Key: z.string().min(1).max(500),
  stage: z.enum(["draft", "final"]),
});

/**
 * Record an uploaded deliverable with its stage. A draft is only kept (send it
 * for review separately). A final delivers: the request moves to Delivered
 * (when legal) and the client is told.
 */
export async function recordStagedDeliverableAction(input: z.infer<typeof deliverableSchema>): Promise<Res> {
  const me = await actor("requests");
  if (!me) return DENIED;
  const parsed = deliverableSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "The upload is incomplete. Try again." };
  const d = parsed.data;
  const { canWorkOnRequest } = await import("@/lib/server-user");
  if (!(await canWorkOnRequest(d.requestId))) return DENIED;
  const r = await loadReq(d.requestId);
  if (!r) return { ok: false, error: "This request no longer exists." };
  if (!d.r2Key.startsWith(`requests/${r.id}/`)) return { ok: false, error: "Invalid upload key." };
  try {
    const [doc] = await db
      .insert(serviceRequestDocument)
      .values({
        requestId: r.id,
        kind: "deliverable",
        fileName: d.fileName,
        contentType: d.contentType || null,
        sizeBytes: d.sizeBytes,
        r2Key: d.r2Key,
        uploadedByRole: "admin",
        uploadedByName: me.displayName,
        stage: d.stage,
      })
      .returning({ id: serviceRequestDocument.id });
    if (d.stage === "final") {
      await db.insert(serviceRequestEvent).values({
        requestId: r.id,
        type: "deliverable_uploaded",
        message: `${d.fileName} is ready to download.`,
        visibility: "client",
        actorRole: "admin",
        actorName: me.displayName,
      });
      if (r.status !== "delivered" && canTransition(r.status, "delivered")) {
        await adminSetRequestStatusAction(r.id, "delivered", "Your final files are ready to download.");
      } else {
        await notifyUsers({
          userIds: [r.userId],
          category: "progress",
          title: `New file ready: ${d.fileName}`,
          link: `/dashboard/requests/${r.id}`,
          dedupeKey: `final:${doc.id}`,
        });
      }
    } else {
      await db.insert(serviceRequestEvent).values({
        requestId: r.id,
        type: "note",
        message: `Draft uploaded: ${d.fileName}`,
        visibility: "internal",
        actorRole: "admin",
        actorName: me.displayName,
      });
    }
    await recordAudit({ action: `request.deliverable_${d.stage}`, entity: "request", entityId: r.id, meta: { number: r.number, fileName: d.fileName } });
    touch([r.id]);
    return { ok: true, message: d.stage === "final" ? "Final file published. The client was told." : "Draft saved. Send it for client review when it is ready." };
  } catch (e) {
    return failure(e);
  }
}

/** Flip a deliverable between draft and final (final does not re-send anything). */
export async function setDeliverableStageAction(documentId: string, stage: "draft" | "final"): Promise<Res> {
  const me = await actor("requests");
  if (!me) return DENIED;
  if (!uuid.safeParse(documentId).success || !["draft", "final"].includes(stage)) return { ok: false, error: "Unknown file." };
  const [doc] = await db.select().from(serviceRequestDocument).where(eq(serviceRequestDocument.id, documentId)).limit(1);
  if (!doc || doc.kind !== "deliverable") return { ok: false, error: "Only deliverables have a stage." };
  const { canWorkOnRequest } = await import("@/lib/server-user");
  if (!(await canWorkOnRequest(doc.requestId))) return DENIED;
  await db.update(serviceRequestDocument).set({ stage }).where(eq(serviceRequestDocument.id, doc.id));
  touch([doc.requestId]);
  return { ok: true, message: `Marked ${stage}.` };
}

/**
 * Send a draft deliverable to the client for review: request → client_review,
 * review round + 1 (a review_round row records which file), client told.
 */
export async function sendDraftForReviewAction(requestId: string, documentId: string): Promise<Res> {
  const me = await actor("requests");
  if (!me) return DENIED;
  if (!uuid.safeParse(requestId).success || !uuid.safeParse(documentId).success) return { ok: false, error: "Unknown file." };
  const { canWorkOnRequest } = await import("@/lib/server-user");
  if (!(await canWorkOnRequest(requestId))) return DENIED;
  const r = await loadReq(requestId);
  if (!r) return { ok: false, error: "This request no longer exists." };
  const [doc] = await db.select().from(serviceRequestDocument).where(and(eq(serviceRequestDocument.id, documentId), eq(serviceRequestDocument.requestId, requestId))).limit(1);
  if (!doc || doc.kind !== "deliverable") return { ok: false, error: "Choose a draft deliverable." };
  const res = await sendDraftForReview({ requestId, documentId, actor: { userId: me.id, name: me.displayName } });
  if (!res.ok) return { ok: false, error: res.error };
  touch([requestId]);
  return { ok: true, message: `Sent for review, round ${res.round}. The client was told.` };
}
