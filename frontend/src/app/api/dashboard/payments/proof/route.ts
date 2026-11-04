import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoice } from "@/lib/db/schema";
import { getPortal } from "@/lib/requests/portal";
import { presignPrivatePut, r2PrivateConfigured, uploadPrivateObject } from "@/lib/r2";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { PROOF_PREFIX } from "@/lib/payments/bank-transfer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bank-transfer receipt upload into the PRIVATE bucket under
 * payments/<invoiceId>/. JSON body → presigned PUT (direct upload);
 * multipart body → server relay fallback (small files, e.g. when bucket CORS
 * blocks the direct PUT). Owner-checked on the invoice.
 */

const ALLOWED: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
};
const MAX = 10 * 1024 * 1024;
const RELAY_MAX = 4 * 1024 * 1024;

const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(-80);
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

function check(name: string, type: string, size: number) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED[type]?.includes(ext)) return "Upload a PDF, PNG or JPG of the receipt.";
  if (size <= 0 || size > MAX) return "The receipt must be under 10 MB.";
  return null;
}

export async function POST(req: Request) {
  const portal = await getPortal();
  if (!portal) return bad("Sign in to upload.", 401);
  if (!r2PrivateConfigured) return bad("File storage is not configured yet. Email the receipt to us instead.", 503);
  const rl = await rateLimit(`proof:${portal.user.id}`, RATE_LIMITS.uploadPresign);
  if (!rl.ok) return bad("Too many uploads. Wait a few minutes.", 429);

  const ownerOk = async (invoiceId: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) return false;
    const [inv] = await db
      .select({ id: invoice.id })
      .from(invoice)
      .where(and(eq(invoice.id, invoiceId), eq(invoice.clientId, portal.client.id), isNull(invoice.deletedAt)));
    return Boolean(inv);
  };

  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    const invoiceId = String(form?.get("invoiceId") ?? "");
    if (!(file instanceof File)) return bad("No file.");
    if (!(await ownerOk(invoiceId))) return bad("Invoice not found.", 404);
    const type = file.type || "application/octet-stream";
    const problem = check(file.name, type, file.size) ?? (file.size > RELAY_MAX ? "This file is too large for the backup upload path. Try a smaller photo or PDF." : null);
    if (problem) return bad(problem);
    const key = `${PROOF_PREFIX(invoiceId)}${Date.now()}-${slug(file.name)}`;
    await uploadPrivateObject(key, Buffer.from(await file.arrayBuffer()), type);
    return NextResponse.json({ ok: true, key });
  }

  const body = (await req.json().catch(() => ({}))) as { invoiceId?: string; fileName?: string; contentType?: string; sizeBytes?: number };
  const { invoiceId = "", fileName = "", contentType = "", sizeBytes = 0 } = body;
  if (!(await ownerOk(invoiceId))) return bad("Invoice not found.", 404);
  const problem = check(fileName, contentType, Number(sizeBytes));
  if (problem) return bad(problem);
  const key = `${PROOF_PREFIX(invoiceId)}${Date.now()}-${slug(fileName)}`;
  const uploadUrl = await presignPrivatePut(key, contentType, 60);
  return NextResponse.json({ ok: true, uploadUrl, key });
}
