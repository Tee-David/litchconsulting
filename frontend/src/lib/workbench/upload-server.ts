import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { workbenchConversation } from "@/lib/db/schema";
import { canWorkOnRequest, type SessionUser } from "@/lib/server-user";
import { roleOf } from "@/lib/access";
import { recordAudit } from "@/lib/audit";
import { WorkbenchError, wbAttach, wbStart, type WbConversation, type WbFirstLook } from "@/lib/litchai/workbench";
import { requestContext, workbenchAccess } from "@/lib/workbench/server";

/** Files the workbench reads, and archives it unpacks (ZIP, RAR, 7z; with or without a password). */
export const WB_MIME: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  xls: "application/vnd.ms-excel",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  txt: "text/plain",
  json: "application/json",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
};
export const ARCHIVE_EXT = new Set(["zip", "rar", "7z"]);
export const WB_MAX_BYTES = 20 * 1024 * 1024;
const FIRM_CLIENT = "00000000-0000-4000-8000-000000000001";

export type UploadTarget = {
  clientId: string;
  aiMode: "cloud_masked" | "local_only";
  clientName: string;
  linkedRequest: string | null;
  conversationId: string | null;
};

/** Who an upload belongs to: the workbench's client, the request's client, or the firm. */
export async function uploadTarget(
  u: SessionUser,
  conversationId: string | null,
  requestId: string | null,
): Promise<UploadTarget | { error: string; status: number }> {
  if (conversationId) {
    const a = await workbenchAccess(conversationId);
    if (!a.ok) return { error: "You do not have access to this workbench.", status: 403 };
    return { clientId: a.row.clientId ?? FIRM_CLIENT, aiMode: "cloud_masked", clientName: "Client", linkedRequest: a.row.requestId, conversationId };
  }
  if (requestId) {
    if (!(await canWorkOnRequest(requestId))) return { error: "You do not have access to this request.", status: 403 };
    const ctx = await requestContext(requestId);
    if (!ctx) return { error: "This request no longer exists.", status: 404 };
    return {
      clientId: ctx.req.clientId,
      aiMode: ctx.c?.aiMode === "local_only" ? "local_only" : "cloud_masked",
      clientName: ctx.c?.company || ctx.c?.name || "Client",
      linkedRequest: requestId,
      conversationId: null,
    };
  }
  if (roleOf(u) !== "admin") return { error: "Open the workbench from one of your requests to add files.", status: 403 };
  return { clientId: FIRM_CLIENT, aiMode: "cloud_masked", clientName: "Litch Consulting", linkedRequest: null, conversationId: null };
}

/** A signed, short-lived ticket for one staged upload, tied to the person and the key. */
export function stageToken(userId: string, key: string, exp: number): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(`wb-stage|${userId}|${key}|${exp}`).digest("base64url");
}
export function checkStageToken(userId: string, key: string, exp: number, token: string): boolean {
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const want = Buffer.from(stageToken(userId, key, exp));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

export type Placed = {
  id: string;
  conversation?: WbConversation;
  firstLook?: WbFirstLook;
  /** Still being read (PDF, screenshot): the browser attaches them when ready. */
  pending: number[];
};

/**
 * Put new documents into a workbench: attach them to the open one, or open a new
 * workbench on the first readable one and attach the rest. A document still being
 * read (OCR) is returned in `pending`.
 */
export async function placeDocuments(
  u: SessionUser,
  t: UploadTarget,
  docIds: number[],
  title: string,
  group?: string | null,
): Promise<Placed | { error: string }> {
  const pending: number[] = [];
  let conv: WbConversation | undefined;
  let firstLook: WbFirstLook | undefined;
  let id = t.conversationId;
  for (const d of docIds) {
    try {
      if (id) {
        const res = await wbAttach(id, [d], group);
        conv = res.conversation;
        firstLook = res.first_look ?? firstLook;
      } else {
        const res = await wbStart({ client_id: t.clientId, document_ids: [d], ai_mode: t.aiMode, client_name: t.clientName, title, group });
        id = res.conversation.id;
        conv = res.conversation;
        await db.insert(workbenchConversation).values({ id, requestId: t.linkedRequest, clientId: t.linkedRequest ? t.clientId : null, title, createdBy: u.id });
        await recordAudit({ action: "workbench.opened", entity: t.linkedRequest ? "request" : "workbench", entityId: t.linkedRequest ?? id, meta: { conversation: id, uploaded: title } });
      }
    } catch (e) {
      if (e instanceof WorkbenchError && e.status === 409) {
        pending.push(d);
        continue;
      }
      throw e;
    }
  }
  if (!id) return { error: "These files are still being read (PDFs and screenshots take a minute). Open them from Add files when they are ready." };
  if (t.conversationId) await db.update(workbenchConversation).set({ updatedAt: new Date() }).where(eq(workbenchConversation.id, id));
  return { id, conversation: conv, firstLook, pending };
}
