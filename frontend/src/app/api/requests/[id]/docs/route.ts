import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { serviceRequest, serviceRequestDocument } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/server-user";
import { getClientForUser } from "@/lib/db/queries/clients";
import { presignPrivatePut, presignPrivateGet, r2PrivateConfigured } from "@/lib/r2";

export const dynamic = "force-dynamic";

/**
 * Private-bucket presign endpoints for request documents. Client financial
 * files NEVER touch the public bucket or the generic /api/upload routes —
 * every URL minted here is ownership-checked, short-lived (60s), and GETs
 * force a download (no inline rendering of untrusted uploads).
 */

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "text/csv": ["csv"],
  "application/vnd.ms-excel": ["xls", "csv"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
};

async function authorize(requestId: string) {
  const user = await getSessionUser();
  if (!user) return null;
  const [req] = await db.select().from(serviceRequest).where(eq(serviceRequest.id, requestId));
  if (!req) return null;
  if (user.role === "admin") return { user, req, role: "admin" as const };
  const clientRow = await getClientForUser(user.id, user.email, user.name);
  if (req.clientId !== clientRow.id) return null;
  return { user, req, role: "client" as const };
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-80);
}

/** POST → presigned PUT for a new upload on this request. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!r2PrivateConfigured) {
    return NextResponse.json(
      { ok: false, error: "Document storage isn't configured yet." },
      { status: 503 }
    );
  }
  const auth = await authorize(id);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: { fileName?: string; contentType?: string; sizeBytes?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
  const { fileName, contentType, sizeBytes } = body;
  if (!fileName || !contentType || !sizeBytes) {
    return NextResponse.json({ ok: false, error: "Missing file details" }, { status: 400 });
  }
  if (sizeBytes > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "File is larger than 25 MB" }, { status: 400 });
  }
  const exts = ALLOWED[contentType];
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (!exts || !exts.includes(ext)) {
    return NextResponse.json(
      { ok: false, error: "Allowed formats: XLSX, XLS, CSV, PDF, DOCX, PNG, JPG" },
      { status: 400 }
    );
  }

  const key = `requests/${auth.req.id}/${Date.now()}-${slugify(fileName)}`;
  const uploadUrl = await presignPrivatePut(key, contentType, 60);
  return NextResponse.json({ ok: true, uploadUrl, key });
}

/** GET ?documentId= → presigned download for an existing document. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await authorize(id);
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const documentId = new URL(req.url).searchParams.get("documentId");
  if (!documentId) return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });

  const [doc] = await db
    .select()
    .from(serviceRequestDocument)
    .where(
      and(eq(serviceRequestDocument.id, documentId), eq(serviceRequestDocument.requestId, id))
    );
  if (!doc) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const url = await presignPrivateGet(doc.r2Key, { downloadName: doc.fileName, expiresIn: 60 });
  return NextResponse.json({ ok: true, url });
}
