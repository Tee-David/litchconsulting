import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { workbenchConversation } from "@/lib/db/schema";
import { getSessionUser, canWorkOnRequest } from "@/lib/server-user";
import { roleOf } from "@/lib/access";
import { recordAudit } from "@/lib/audit";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { postEncryptedDocument } from "@/lib/litchai/blind-relay";
import { WorkbenchError, wbAttach, wbStart } from "@/lib/litchai/workbench";
import { requestContext, workbenchAccess } from "@/lib/workbench/server";
import { unreadableFile } from "@/lib/ai-words";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Add a file from the user's computer straight into the workbench.
 * The bytes are encrypted here (blind relay) before they go to the analysis
 * server; nothing is kept in plain text. With `conversationId` the file joins
 * that workbench; without it a new workbench opens on the file.
 */

const MIME_BY_EXT: Record<string, string> = {
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
};
const MAX = 4 * 1024 * 1024; // the serverless request limit is 4.5 MB
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  const u = await getSessionUser();
  if (!u || u.banned || !["admin", "staff"].includes(roleOf(u))) return bad("You do not have access to the workbench.", 403);
  const rl = await rateLimit(`wb-upload:${u.id}`, RATE_LIMITS.uploadPresign);
  if (!rl.ok) return bad("Too many uploads. Wait a few minutes.", 429);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const conversationId = String(form?.get("conversationId") ?? "") || null;
  const requestId = String(form?.get("requestId") ?? "") || null;
  if (!(file instanceof File)) return bad("Choose a file.");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME_BY_EXT[ext];
  if (!mime) return bad("The workbench opens XLSX, XLSM, XLS, ODS, CSV, TSV, TXT, JSON, DOCX and PDF files.");
  if (file.size <= 0 || file.size > MAX) return bad("The file must be under 4 MB here. Add larger files to the request first, then open them from the request.");

  // Who the file belongs to: the workbench's client, the request's client, or the firm.
  // Files not tied to a client belong to the firm (the engine needs a UUID owner).
  let clientId = "00000000-0000-4000-8000-000000000001";
  let aiMode: "cloud_masked" | "local_only" = "cloud_masked";
  let clientName = "Litch Consulting";
  let linkedRequest: string | null = null;
  if (conversationId) {
    const a = await workbenchAccess(conversationId);
    if (!a.ok) return bad("You do not have access to this workbench.", 403);
    clientId = a.row.clientId ?? clientId;
    linkedRequest = a.row.requestId;
  } else if (requestId) {
    if (!(await canWorkOnRequest(requestId))) return bad("You do not have access to this request.", 403);
    const ctx = await requestContext(requestId);
    if (!ctx) return bad("This request no longer exists.", 404);
    clientId = ctx.req.clientId;
    aiMode = ctx.c?.aiMode === "local_only" ? "local_only" : "cloud_masked";
    clientName = ctx.c?.company || ctx.c?.name || "Client";
    linkedRequest = requestId;
  } else if (roleOf(u) !== "admin") {
    return bad("Open the workbench from one of your requests to add files.", 403);
  }

  try {
    const sent = await postEncryptedDocument(Buffer.from(await file.arrayBuffer()), { clientId, filename: file.name, mime });
    if (conversationId) {
      const res = await wbAttach(conversationId, [sent.document_id]);
      await db.update(workbenchConversation).set({ updatedAt: new Date() }).where(eq(workbenchConversation.id, conversationId));
      await recordAudit({ action: "workbench.file_added", entity: "workbench", entityId: conversationId, meta: { file: file.name } });
      return NextResponse.json({ ok: true, id: conversationId, conversation: res.conversation, firstLook: res.first_look });
    }
    const title = linkedRequest ? `${file.name} · ${clientName}` : file.name;
    const res = await wbStart({ client_id: clientId, document_ids: [sent.document_id], ai_mode: aiMode, client_name: clientName, title });
    await db.insert(workbenchConversation).values({ id: res.conversation.id, requestId: linkedRequest, clientId: linkedRequest ? clientId : null, title, createdBy: u.id });
    await recordAudit({ action: "workbench.opened", entity: linkedRequest ? "request" : "workbench", entityId: linkedRequest ?? res.conversation.id, meta: { conversation: res.conversation.id, uploaded: file.name } });
    return NextResponse.json({ ok: true, id: res.conversation.id });
  } catch (e) {
    if (e instanceof WorkbenchError) {
      const msg = e.status === 409
        ? "This file is still being read (PDFs take a minute). Try adding it again shortly."
        : unreadableFile(e.message) ?? e.message;
      return bad(msg, 422);
    }
    console.error("[workbench upload]", e);
    return bad("The file could not be added. Try again in a minute.", 502);
  }
}
