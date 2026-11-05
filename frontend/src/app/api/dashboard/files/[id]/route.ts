import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { serviceRequest, serviceRequestDocument } from "@/lib/db/schema";
import { getPortal } from "@/lib/requests/portal";
import { presignPrivateGet, r2PrivateConfigured } from "@/lib/r2";
import { downloadBlock, ensureDocumentScanned } from "@/lib/uploads/scan";

export const dynamic = "force-dynamic";

/**
 * GET → 302 to a 60-second presigned download of one request file, for the
 * client who owns the request. Files are virus-scanned first (lib/uploads/scan.ts);
 * unscanned and infected files are never served.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const portal = await getPortal();
  if (!portal) return NextResponse.json({ ok: false, error: "Sign in to download files." }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const [doc] = await db
    .select({ id: serviceRequestDocument.id, requestId: serviceRequestDocument.requestId, r2Key: serviceRequestDocument.r2Key, fileName: serviceRequestDocument.fileName, scanStatus: serviceRequestDocument.scanStatus })
    .from(serviceRequestDocument)
    .innerJoin(serviceRequest, eq(serviceRequest.id, serviceRequestDocument.requestId))
    .where(and(eq(serviceRequestDocument.id, id), eq(serviceRequest.clientId, portal.client.id), isNull(serviceRequest.deletedAt)));
  if (!doc) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (!r2PrivateConfigured) return NextResponse.json({ ok: false, error: "File storage is not configured." }, { status: 503 });
  const blocked = downloadBlock(await ensureDocumentScanned(doc), "client");
  if (blocked) return NextResponse.json({ ok: false, error: blocked }, { status: 403 });
  if (!r2PrivateConfigured) return NextResponse.json({ ok: false, error: "File storage is not configured." }, { status: 503 });
  const url = await presignPrivateGet(doc.r2Key, { downloadName: doc.fileName, expiresIn: 60 });
  return NextResponse.redirect(url, 302);
}
