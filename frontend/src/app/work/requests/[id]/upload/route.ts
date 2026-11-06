import { NextResponse } from "next/server";
import { canWorkOnRequest } from "@/lib/server-user";
import { presignPrivatePut, r2PrivateConfigured, uploadPrivateObject } from "@/lib/r2";
import { REQUEST_DOC_FORMATS, allowedRequestDoc } from "@/lib/upload-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Staff upload of a deliverable into the PRIVATE bucket (requests/<id>/…).
 * JSON → presigned PUT; multipart → server relay fallback for small files.
 * Assigned staff and admins only.
 */

const MAX = 25 * 1024 * 1024;
const RELAY_MAX = 4 * 1024 * 1024;
const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(-80);
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

function check(name: string, type: string, size: number) {
  if (!allowedRequestDoc(name, type)) return `Allowed formats: ${REQUEST_DOC_FORMATS}.`;
  if (size <= 0 || size > MAX) return "Files must be under 25 MB.";
  return null;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(await canWorkOnRequest(id))) return bad("You are not assigned to this request.", 403);
  if (!r2PrivateConfigured) return bad("File storage is not configured yet.", 503);

  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return bad("No file.");
    const type = file.type || "application/octet-stream";
    const problem = check(file.name, type, file.size) ?? (file.size > RELAY_MAX ? "This file is too large for the backup upload path." : null);
    if (problem) return bad(problem);
    const key = `requests/${id}/${Date.now()}-${slug(file.name)}`;
    await uploadPrivateObject(key, Buffer.from(await file.arrayBuffer()), type);
    return NextResponse.json({ ok: true, key });
  }

  const body = (await req.json().catch(() => ({}))) as { fileName?: string; contentType?: string; sizeBytes?: number };
  const problem = check(body.fileName ?? "", body.contentType ?? "", Number(body.sizeBytes ?? 0));
  if (problem) return bad(problem);
  const key = `requests/${id}/${Date.now()}-${slug(body.fileName!)}`;
  return NextResponse.json({ ok: true, key, uploadUrl: await presignPrivatePut(key, body.contentType!, 60) });
}
