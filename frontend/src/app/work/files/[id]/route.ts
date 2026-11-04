import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { serviceRequestDocument } from "@/lib/db/schema";
import { canWorkOnRequest } from "@/lib/server-user";
import { presignPrivateGet, r2PrivateConfigured } from "@/lib/r2";

export const dynamic = "force-dynamic";

/** GET → 302 to a 60-second presigned download, for staff assigned to the request (or admins). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const [doc] = await db
    .select({ requestId: serviceRequestDocument.requestId, r2Key: serviceRequestDocument.r2Key, fileName: serviceRequestDocument.fileName, scan: serviceRequestDocument.scanStatus })
    .from(serviceRequestDocument)
    .where(eq(serviceRequestDocument.id, id));
  if (!doc || !(await canWorkOnRequest(doc.requestId))) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (doc.scan === "infected") return NextResponse.json({ ok: false, error: "This file failed the virus scan." }, { status: 403 });
  if (!r2PrivateConfigured) return NextResponse.json({ ok: false, error: "File storage is not configured." }, { status: 503 });
  const url = await presignPrivateGet(doc.r2Key, { downloadName: doc.fileName, expiresIn: 60 });
  return NextResponse.redirect(url, 302);
}
