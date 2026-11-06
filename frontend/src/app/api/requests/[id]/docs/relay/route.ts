import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { serviceRequest } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/server-user";
import { getClientForUser } from "@/lib/db/queries/clients";
import { uploadPrivateObject, r2PrivateConfigured } from "@/lib/r2";
import { REQUEST_DOC_FORMATS, allowedRequestDoc } from "@/lib/upload-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-relay fallback for private request uploads. The primary path is a
 * direct browser→R2 presigned PUT (see ../route.ts); if that PUT is blocked
 * (e.g. bucket CORS not yet configured) the browser retries here and we stream
 * the file to the private bucket server-side. Bounded by Vercel's request-body
 * limit, so it only covers smaller files — large files need the direct path.
 */

const MAX_BYTES = 4 * 1024 * 1024; // stays under the serverless body limit

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-80);
}

async function authorized(requestId: string) {
  const user = await getSessionUser();
  if (!user) return false;
  const [req] = await db.select().from(serviceRequest).where(eq(serviceRequest.id, requestId));
  if (!req) return false;
  if (user.role === "admin") return true;
  const clientRow = await getClientForUser(user.id, user.email, user.name);
  return req.clientId === clientRow.id;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!r2PrivateConfigured) {
    return NextResponse.json({ ok: false, error: "Document storage isn't configured yet." }, { status: 503 });
  }
  if (!(await authorized(id))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid upload" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "No file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "This file is too large for the fallback path — please try again." },
      { status: 413 }
    );
  }
  const contentType = file.type || "application/octet-stream";
  if (!allowedRequestDoc(file.name, contentType)) {
    return NextResponse.json(
      { ok: false, error: `Allowed formats: ${REQUEST_DOC_FORMATS}` },
      { status: 400 }
    );
  }

  const key = `requests/${id}/${Date.now()}-${slugify(file.name)}`;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    await uploadPrivateObject(key, buf, contentType);
    return NextResponse.json({ ok: true, key });
  } catch {
    return NextResponse.json({ ok: false, error: "Upload failed" }, { status: 500 });
  }
}
