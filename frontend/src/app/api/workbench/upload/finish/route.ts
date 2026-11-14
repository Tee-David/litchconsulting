import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server-user";
import { roleOf } from "@/lib/access";
import { recordAudit } from "@/lib/audit";
import { deletePrivateObject, getPrivateObject } from "@/lib/r2";
import { ArchivePasswordError, postEncryptedArchive, postEncryptedDocument } from "@/lib/litchai/blind-relay";
import { WorkbenchError } from "@/lib/litchai/workbench";
import { unreadableFile } from "@/lib/ai-words";
import { ARCHIVE_EXT, WB_MAX_BYTES, WB_MIME, checkStageToken, placeDocuments, uploadTarget } from "@/lib/workbench/upload-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Step 2 of a large or archive upload: read the staged file from the private bucket,
 * encrypt it (blind relay) and send it on. An archive is unpacked on the analysis
 * server; with a password it asks for one (401, the staged copy is kept 15 minutes
 * for the retry). The staged copy is deleted once it is handled.
 */
const bad = (error: string, status = 400, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, error, ...extra }, { status });

export async function POST(req: Request) {
  const u = await getSessionUser();
  if (!u || u.banned || !["admin", "staff"].includes(roleOf(u))) return bad("You do not have access to the workbench.", 403);
  const body = (await req.json().catch(() => null)) as {
    key?: string; exp?: number; token?: string; name?: string; conversationId?: string; requestId?: string; password?: string;
  } | null;
  const key = String(body?.key ?? "");
  const exp = Number(body?.exp ?? 0);
  if (!key.startsWith("wb-staging/") || !checkStageToken(u.id, key, exp, String(body?.token ?? ""))) {
    return bad("This upload has expired. Add the file again.", 410);
  }
  const name = String(body?.name ?? key.split("/").pop() ?? "file").slice(0, 200);
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const mime = WB_MIME[ext];
  if (!mime) return bad("This file type is not read by the workbench.");
  const t = await uploadTarget(u, body?.conversationId || null, body?.requestId || null);
  if ("error" in t) return bad(t.error, t.status);

  let bytes: Buffer;
  try {
    bytes = await getPrivateObject(key);
  } catch {
    return bad("The file did not arrive. Add it again.", 404);
  }
  if (bytes.length > WB_MAX_BYTES) {
    await deletePrivateObject(key).catch(() => {});
    return bad("Each file must be 20 MB or smaller.");
  }

  const title = t.linkedRequest ? `${name} · ${t.clientName}` : name;
  try {
    let docIds: number[];
    let skipped: { name: string; reason: string }[] = [];
    let added: string[];
    if (ARCHIVE_EXT.has(ext)) {
      const res = await postEncryptedArchive(bytes, { clientId: t.clientId, filename: name, password: body?.password || null });
      docIds = res.documents.map((d) => d.document_id);
      added = res.documents.map((d) => d.filename);
      skipped = res.skipped;
    } else {
      const sent = await postEncryptedDocument(bytes, { clientId: t.clientId, filename: name, mime });
      docIds = [sent.document_id];
      added = [name];
    }
    await deletePrivateObject(key).catch(() => {});
    const placed = await placeDocuments(u, t, docIds, title);
    if ("error" in placed) return bad(placed.error, 422);
    await recordAudit({
      action: "workbench.file_added",
      entity: t.linkedRequest ? "request" : "workbench",
      entityId: t.linkedRequest ?? placed.id,
      meta: { conversation: placed.id, file: name, files: added.length, skipped: skipped.length },
    });
    return NextResponse.json({
      ok: true,
      id: placed.id,
      conversation: placed.conversation,
      firstLook: placed.firstLook,
      pending: placed.pending[0],
      pendingIds: placed.pending,
      added,
      skipped,
    });
  } catch (e) {
    if (e instanceof ArchivePasswordError) {
      // Keep the staged copy: the person types the password and we try again.
      return bad(e.message, 401, { needPassword: true, wrongPassword: e.code === "wrong_password" });
    }
    await deletePrivateObject(key).catch(() => {});
    if (e instanceof WorkbenchError) return bad(unreadableFile(e.message) ?? e.message, 422);
    console.error("[workbench upload finish]", e);
    return bad(e instanceof Error && e.message.length < 200 ? e.message : "The file could not be added. Try again in a minute.", 502);
  }
}
