import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { client, serviceRequest, serviceRequestDocument, workbenchConversation } from "@/lib/db/schema";
import { canWorkOnRequest, getSessionUser } from "@/lib/server-user";
import { roleOf } from "@/lib/access";

/**
 * Workbench access. A conversation is reachable when its request is one the
 * user can work on (admins: any; staff: assigned only). A conversation with
 * no request (a blank workbook started from Analyses) is admin-only.
 */
export async function workbenchAccess(id: string) {
  const u = await getSessionUser();
  if (!u || u.banned) return { ok: false as const, status: 401 };
  const [row] = await db.select().from(workbenchConversation).where(eq(workbenchConversation.id, id)).limit(1);
  if (!row) return { ok: false as const, status: 404 };
  const allowed = row.requestId ? await canWorkOnRequest(row.requestId) : roleOf(u) === "admin";
  if (!allowed) return { ok: false as const, status: 403 };
  return { ok: true as const, row, user: u, role: roleOf(u) };
}

export const SHEET_TYPES = /\.(xlsx|xlsm|csv)$/i;
export const PDF_TYPE = /\.pdf$/i;

export type RequestFile = {
  id: string;
  fileName: string;
  kind: string;
  stage: string | null;
  litchaiDocumentId: string | null;
  litchaiStatus: string | null;
  createdAt: Date;
  usable: boolean;
};

/** Files on a request that the workbench can open (spreadsheets, CSV, PDF). */
export async function requestFiles(requestId: string): Promise<RequestFile[]> {
  const rows = await db
    .select()
    .from(serviceRequestDocument)
    .where(eq(serviceRequestDocument.requestId, requestId))
    .orderBy(desc(serviceRequestDocument.createdAt));
  return rows
    .filter((d) => SHEET_TYPES.test(d.fileName) || PDF_TYPE.test(d.fileName))
    .map((d) => ({
      id: d.id,
      fileName: d.fileName,
      kind: d.kind,
      stage: d.stage,
      litchaiDocumentId: d.litchaiDocumentId,
      litchaiStatus: d.litchaiStatus,
      createdAt: d.createdAt as Date,
      usable: SHEET_TYPES.test(d.fileName) || d.litchaiStatus === "ready" || d.litchaiStatus === "published",
    }));
}

export async function requestContext(requestId: string) {
  const [r] = await db
    .select({ req: serviceRequest, c: client })
    .from(serviceRequest)
    .leftJoin(client, eq(client.id, serviceRequest.clientId))
    .where(and(eq(serviceRequest.id, requestId), isNull(serviceRequest.deletedAt)))
    .limit(1);
  return r ?? null;
}

/**
 * Make sure a request file is on the analysis server (blind relay: encrypted
 * in this function, only ciphertext leaves). Returns the LitchAI document id.
 */
export async function ensureRelayed(fileId: string, requestId: string, clientId: string): Promise<number> {
  const [doc] = await db
    .select()
    .from(serviceRequestDocument)
    .where(and(eq(serviceRequestDocument.id, fileId), eq(serviceRequestDocument.requestId, requestId)))
    .limit(1);
  if (!doc) throw new Error("That file is not on this request.");
  if (doc.litchaiDocumentId && doc.litchaiStatus !== "failed") return Number(doc.litchaiDocumentId);
  const { getPrivateObject } = await import("@/lib/r2");
  const { postEncryptedDocument } = await import("@/lib/litchai/blind-relay");
  const plaintext = await getPrivateObject(doc.r2Key);
  const result = await postEncryptedDocument(plaintext, {
    clientId,
    filename: doc.fileName,
    mime: doc.contentType || "application/octet-stream",
  });
  await db
    .update(serviceRequestDocument)
    .set({ litchaiDocumentId: String(result.document_id), litchaiStatus: "queued" })
    .where(eq(serviceRequestDocument.id, doc.id));
  return Number(result.document_id);
}

/** The request file behind a LitchAI document id (for the PDF side view). */
export async function fileForEngineDoc(requestId: string, engineDocId: number) {
  const [doc] = await db
    .select()
    .from(serviceRequestDocument)
    .where(and(eq(serviceRequestDocument.requestId, requestId), eq(serviceRequestDocument.litchaiDocumentId, String(engineDocId))))
    .limit(1);
  return doc ?? null;
}

export async function conversationsFor(requestIds: string[] | "all", limit = 40) {
  const q = db.select().from(workbenchConversation);
  const rows =
    requestIds === "all"
      ? await q.orderBy(desc(workbenchConversation.updatedAt)).limit(limit)
      : requestIds.length
        ? await q.where(inArray(workbenchConversation.requestId, requestIds)).orderBy(desc(workbenchConversation.updatedAt)).limit(limit)
        : [];
  return rows;
}
