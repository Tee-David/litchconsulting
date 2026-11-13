"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { serviceRequestDocument, serviceRequestEvent, workbenchConversation } from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit";
import { canWorkOnRequest, getSessionUser } from "@/lib/server-user";
import { roleOf } from "@/lib/access";
import {
  WorkbenchError,
  wbAttach,
  wbDecide,
  wbDownload,
  wbGet,
  wbProviders,
  wbRunTool,
  wbStart,
  wbUserEdits,
  type WbBatch,
  type WbConversation,
  type WbFirstLook,
  type WbProvider,
} from "@/lib/litchai/workbench";
import { ensureRelayed, requestContext, workbenchAccess } from "./server";
import { unreadableFile } from "@/lib/ai-words";

type Res<T = object> = ({ ok: true; message?: string } & T) | { ok: false; error: string };

const DENIED = { ok: false as const, error: "You do not have access to this workbench." };
const id = z.string().regex(/^wb-[0-9a-f]{6,32}$/);
const uuid = z.string().uuid();

function fail(e: unknown, fallback = "That did not work. Try again."): { ok: false; error: string } {
  if (e instanceof WorkbenchError) return { ok: false, error: unreadableFile(e.message) ?? e.message };
  if (e instanceof Error && /is not set — cannot reach LitchAI/.test(e.message)) {
    return { ok: false, error: "The analysis server is not connected yet." };
  }
  if (e instanceof Error && /fetch failed|ECONNREFUSED|ENOTFOUND|timed out/i.test(e.message)) {
    return { ok: false, error: "The analysis server did not answer. Try again in a minute." };
  }
  console.error("[workbench]", e);
  return { ok: false, error: e instanceof Error && e.message.length < 160 ? e.message : fallback };
}

async function guard(conversationId: string) {
  if (!id.safeParse(conversationId).success) return null;
  const a = await workbenchAccess(conversationId);
  return a.ok ? a : null;
}

async function touch(conversationId: string) {
  await db.update(workbenchConversation).set({ updatedAt: new Date() }).where(eq(workbenchConversation.id, conversationId));
}

// --- start --------------------------------------------------------------------------
const startSchema = z.object({
  requestId: uuid.nullable(),
  fileIds: z.array(uuid).max(12).default([]),
  blank: z.string().trim().min(1).max(80).nullable().default(null),
});

/**
 * Open a workbench conversation on a request's files (or a blank workbook).
 * Files not yet on the analysis server are relayed first (encrypted here).
 * The client's AI mode decides cloud-masked or local-only for the whole thread.
 */
export async function startWorkbenchAction(input: z.input<typeof startSchema>): Promise<Res<{ id: string }>> {
  const u = await getSessionUser();
  if (!u || u.banned) return DENIED;
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose at least one file, or name a blank workbook." };
  const { requestId, fileIds, blank } = parsed.data;
  if (!fileIds.length && !blank) return { ok: false, error: "Choose at least one file, or name a blank workbook." };
  if (requestId ? !(await canWorkOnRequest(requestId)) : roleOf(u) !== "admin") return DENIED;

  try {
    const ctx = requestId ? await requestContext(requestId) : null;
    if (requestId && !ctx) return { ok: false, error: "This request no longer exists." };
    const clientId = ctx?.req.clientId ?? null;
    const documentIds: number[] = [];
    for (const f of fileIds) documentIds.push(await ensureRelayed(f, requestId!, clientId!));
    const clientName = ctx?.c?.company || ctx?.c?.name || "Client";
    const title = ctx ? `${ctx.req.number} · ${clientName}` : blank || "New workbook";
    const res = await wbStart({
      client_id: clientId,
      document_ids: documentIds,
      ai_mode: ctx?.c?.aiMode === "local_only" ? "local_only" : "cloud_masked",
      client_name: clientName,
      title,
      blank_workbook: blank,
    });
    await db.insert(workbenchConversation).values({
      id: res.conversation.id,
      requestId,
      clientId,
      title,
      createdBy: u.id,
    });
    await recordAudit({
      action: "workbench.opened",
      entity: requestId ? "request" : "workbench",
      entityId: requestId ?? res.conversation.id,
      meta: { conversation: res.conversation.id, files: fileIds.length, blank: Boolean(blank), aiMode: res.conversation.ai_mode },
    });
    return { ok: true, id: res.conversation.id };
  } catch (e) {
    if (e instanceof WorkbenchError && e.status === 409) {
      return { ok: false, error: `${e.message} Wait for the file to finish reading, or choose a spreadsheet.` };
    }
    return fail(e, "The workbench could not open those files.");
  }
}

// --- reads --------------------------------------------------------------------------
export async function getConversationAction(conversationId: string): Promise<Res<{ conversation: WbConversation }>> {
  if (!(await guard(conversationId))) return DENIED;
  try {
    return { ok: true, conversation: (await wbGet(conversationId)).conversation };
  } catch (e) {
    return fail(e);
  }
}

export async function providersAction(probe = false): Promise<Res<{ chain: WbProvider[] }>> {
  const u = await getSessionUser();
  if (!u || u.banned || !["admin", "staff"].includes(roleOf(u))) return DENIED;
  try {
    return { ok: true, chain: (await wbProviders(probe)).chain };
  } catch (e) {
    return fail(e);
  }
}

// --- proposals ----------------------------------------------------------------------
const decideSchema = z.object({
  conversationId: id,
  batchId: z.string().min(1).max(64),
  action: z.enum(["accept", "reject", "undo"]),
  edits: z.record(z.string(), z.object({ new_value: z.unknown().optional(), new_formula: z.string().max(2000).optional() })).optional(),
});

export async function decideBatchAction(input: z.infer<typeof decideSchema>): Promise<Res<{ batch: WbBatch; conversation: WbConversation }>> {
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That change is not valid." };
  const d = parsed.data;
  const a = await guard(d.conversationId);
  if (!a) return DENIED;
  try {
    const edits = d.edits ? Object.fromEntries(Object.entries(d.edits).map(([k, v]) => [Number(k), v])) : undefined;
    const res = await wbDecide(d.conversationId, d.batchId, d.action, edits);
    await touch(d.conversationId);
    if (d.action !== "reject") {
      await recordAudit({
        action: `workbench.batch_${d.action}`,
        entity: a.row.requestId ? "request" : "workbench",
        entityId: a.row.requestId ?? d.conversationId,
        meta: { conversation: d.conversationId, batch: d.batchId, title: res.batch.title, status: res.batch.status, gate: res.batch.gate?.status ?? null, edited: Boolean(edits) },
      });
    }
    const msg =
      res.batch.status === "blocked"
        ? res.batch.gate?.status === "conflict"
          ? "Not applied: those cells changed since Sage proposed this. Ask again for a fresh proposal."
          : "Not applied: the recompute found formula errors. The previous version is kept."
        : d.action === "accept" ? "Accepted. A new version was saved."
        : d.action === "undo" ? "Undone. The change was reversed as a new version."
        : "Rejected. Nothing changed in the file.";
    return { ok: true, message: msg, batch: res.batch, conversation: res.conversation };
  } catch (e) {
    return fail(e);
  }
}

// --- a person's own edits (E2) -------------------------------------------------------
const editSchema = z.object({
  conversationId: id,
  workbookId: z.string().min(1).max(120),
  edits: z
    .array(
      z.object({
        sheet: z.string().min(1).max(120),
        cell: z.string().regex(/^\$?[A-Za-z]{1,3}\$?\d{1,7}$/),
        value: z.union([z.string().max(32000), z.number().finite(), z.boolean(), z.null()]).optional(),
        formula: z.string().max(8000).optional(),
        clear: z.boolean().optional(),
        number_format: z.string().max(64).optional(),
      }),
    )
    .min(1)
    .max(5000),
});

/** Typed values, formulas, formats and clears. Admin, or staff assigned to the request. */
export async function saveEditsAction(input: z.input<typeof editSchema>): Promise<Res<{ batch: WbBatch; conversation: WbConversation }>> {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That edit is not valid." };
  const d = parsed.data;
  const a = await guard(d.conversationId);
  if (!a) return DENIED;
  const u = await getSessionUser();
  const author = (u?.name || u?.email || "a team member").slice(0, 80);
  try {
    const res = await wbUserEdits(d.conversationId, d.workbookId, author, d.edits);
    await touch(d.conversationId);
    await recordAudit({
      action: "workbench.edited",
      entity: a.row.requestId ? "request" : "workbench",
      entityId: a.row.requestId ?? d.conversationId,
      meta: { conversation: d.conversationId, batch: res.batch.id, cells: d.edits.length, status: res.batch.status, gate: res.batch.gate?.status ?? null },
    });
    if (res.batch.status === "blocked") {
      return { ok: false, error: "Not saved: the recompute found a formula error. Check the formula and try again." };
    }
    return { ok: true, message: d.edits.length === 1 ? "Saved." : `Saved ${d.edits.length} cells.`, batch: res.batch, conversation: res.conversation };
  } catch (e) {
    return fail(e);
  }
}

// --- direct tools (chips, new sheet / workbook, chart re-proposals) ----------------
const TOOLS = ["flag_anomalies", "reconcile", "categorise_rows", "build_statement", "clean_values", "create_sheet", "create_workbook", "add_chart", "pivot", "profile_workbook"] as const;
const toolSchema = z.object({
  conversationId: id,
  tool: z.enum(TOOLS),
  args: z.record(z.string(), z.unknown()).default({}),
});

export async function runToolAction(input: z.input<typeof toolSchema>): Promise<Res<{ summary: string; batch: WbBatch | null; data: Record<string, unknown>; chartPreview: Record<string, unknown> | null }>> {
  const parsed = toolSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That action is not available here." };
  const d = parsed.data;
  if (!(await guard(d.conversationId))) return DENIED;
  try {
    const out = await wbRunTool(d.conversationId, d.tool, d.args);
    await touch(d.conversationId);
    return { ok: true, summary: out.summary, batch: out.batch, data: out.data, chartPreview: out.chart_preview ?? null };
  } catch (e) {
    return fail(e);
  }
}

// --- attach ------------------------------------------------------------------------
export async function attachFilesAction(conversationId: string, fileIds: string[]): Promise<Res<{ conversation: WbConversation; firstLook: WbFirstLook }>> {
  const a = await guard(conversationId);
  if (!a) return DENIED;
  const files = z.array(uuid).min(1).max(12).safeParse(fileIds);
  if (!files.success) return { ok: false, error: "Choose a file to add." };
  if (!a.row.requestId || !a.row.clientId) return { ok: false, error: "This workbench is not linked to a request, so there are no request files to add." };
  try {
    const docs: number[] = [];
    for (const f of files.data) docs.push(await ensureRelayed(f, a.row.requestId, a.row.clientId));
    const res = await wbAttach(conversationId, docs);
    await touch(conversationId);
    return { ok: true, message: "Added. Sage has read the new file.", conversation: res.conversation, firstLook: res.first_look };
  } catch (e) {
    if (e instanceof WorkbenchError && e.status === 409) {
      return { ok: false, error: `${e.message} Try again when it shows Ready.` };
    }
    return fail(e);
  }
}

// --- final actions (all through the recompute gate) ------------------------------
const deliverSchema = z.object({
  conversationId: id,
  workbookId: z.string().min(1).max(64),
  mode: z.enum(["draft", "review", "final"]),
  fileName: z.string().trim().min(1).max(120),
  note: z.string().trim().max(2000).optional(),
});

/**
 * Save the gated workbook to the request: as a draft (kept), sent for client
 * review (opens the next review round), or as the final deliverable. The file
 * is the copy that just passed the recompute gate.
 */
export async function deliverAction(input: z.infer<typeof deliverSchema>): Promise<Res<{ gate: string }>> {
  const parsed = deliverSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Give the file a name." };
  const d = parsed.data;
  const a = await guard(d.conversationId);
  if (!a) return DENIED;
  if (!a.row.requestId) return { ok: false, error: "This workbench is not linked to a request. Download the file instead." };
  const requestId = a.row.requestId;
  try {
    const { bytes, gate } = await wbDownload(d.conversationId, d.workbookId, { verified: true });
    const { uploadPrivateObject, r2PrivateConfigured } = await import("@/lib/r2");
    if (!r2PrivateConfigured) return { ok: false, error: "File storage is not configured." };
    const safe = d.fileName.replace(/[^\w.\- ]+/g, "_").replace(/\.xlsx$/i, "") + ".xlsx";
    const key = `requests/${requestId}/workbench/${Date.now()}-${safe}`;
    const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    await uploadPrivateObject(key, bytes, mime);
    const { recordStagedDeliverableAction, sendDraftForReviewAction } = await import("@/app/admin/requests/work-actions");
    const rec = await recordStagedDeliverableAction({
      requestId, fileName: safe, contentType: mime, sizeBytes: bytes.length, r2Key: key,
      stage: d.mode === "final" ? "final" : "draft",
    });
    if (!rec.ok) return rec;
    let message = rec.message ?? "Saved to the request.";
    if (d.mode === "review") {
      const [doc] = await db.select({ id: serviceRequestDocument.id }).from(serviceRequestDocument).where(eq(serviceRequestDocument.r2Key, key)).limit(1);
      const sent = doc ? await sendDraftForReviewAction(requestId, doc.id) : { ok: false as const, error: "The draft was saved but could not be sent." };
      if (!sent.ok) return sent;
      message = sent.message ?? "Sent for client review.";
    }
    if (d.note && d.mode !== "draft") {
      await db.insert(serviceRequestEvent).values({
        requestId, type: "note", message: d.note, visibility: "client",
        actorRole: roleOf(a.user) === "admin" ? "admin" : "staff", actorName: a.user.name || a.user.email,
      });
    }
    await recordAudit({
      action: `workbench.deliver_${d.mode}`, entity: "request", entityId: requestId,
      meta: { conversation: d.conversationId, workbook: d.workbookId, fileName: safe, gate: gate.status, formulas: gate.formulas },
    });
    await touch(d.conversationId);
    return {
      ok: true,
      gate: gate.status,
      message: gate.status === "unverified" ? `${message} The recompute could not run, so the file is marked unverified.` : message,
    };
  } catch (e) {
    return fail(e, "The file was not saved.");
  }
}

// --- open an analyzed engine document in a new workbench ----------------------------
/**
 * "Open in workbench" from an Analysis result. The client, request and AI mode
 * come from the server, never from the browser.
 */
export async function openDocumentInWorkbenchAction(engineDocId: number): Promise<Res<{ id: string }>> {
  const u = await getSessionUser();
  if (!u || u.banned || roleOf(u) !== "admin") return DENIED;
  if (!Number.isInteger(engineDocId) || engineDocId <= 0) return { ok: false, error: "Unknown file." };
  try {
    const { getReview } = await import("@/lib/litchai/client");
    const review = await getReview(engineDocId);
    const [link] = await db
      .select({ requestId: serviceRequestDocument.requestId })
      .from(serviceRequestDocument)
      .where(eq(serviceRequestDocument.litchaiDocumentId, String(engineDocId)))
      .limit(1);
    const ctx = link ? await requestContext(link.requestId) : null;
    const clientName = ctx?.c?.company || ctx?.c?.name || "Client";
    const title = ctx ? `${ctx.req.number} · ${review.document.filename}` : review.document.filename;
    const res = await wbStart({
      client_id: review.document.client_id || null,
      document_ids: [engineDocId],
      ai_mode: ctx?.c?.aiMode === "local_only" ? "local_only" : "cloud_masked",
      client_name: clientName,
      title,
    });
    await db.insert(workbenchConversation).values({
      id: res.conversation.id,
      requestId: ctx ? ctx.req.id : null,
      clientId: ctx ? ctx.req.clientId : null,
      title,
      createdBy: u.id,
    });
    await recordAudit({ action: "workbench.opened", entity: ctx ? "request" : "workbench", entityId: ctx?.req.id ?? res.conversation.id, meta: { conversation: res.conversation.id, fromAnalysis: engineDocId } });
    return { ok: true, id: res.conversation.id };
  } catch (e) {
    return fail(e, "The workbench could not open this file.");
  }
}
