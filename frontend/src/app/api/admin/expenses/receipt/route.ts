import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { expense } from "@/lib/db/schema";
import { presignPrivatePut, r2PrivateConfigured, uploadPrivateObject } from "@/lib/r2";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { actor } from "@/app/admin/_lib/guard";
import { RECEIPT_PREFIX } from "@/lib/accounting/categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Expense receipt upload into the PRIVATE bucket under expenses/<expenseId>/.
 * JSON body → presigned PUT (direct upload); multipart body → server relay
 * for small files when bucket CORS blocks the direct PUT. Billing area only.
 * The key is attached to the row by attachReceiptAction, which checks the prefix.
 */

const ALLOWED: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
};
const MAX = 10 * 1024 * 1024;
const RELAY_MAX = 4 * 1024 * 1024;


const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(-80);
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

function check(name: string, type: string, size: number) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED[type]?.includes(ext)) return "Upload a PDF, PNG, JPG or WebP of the receipt.";
  if (size <= 0 || size > MAX) return "The receipt must be under 10 MB.";
  return null;
}

async function exists(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const [row] = await db.select({ id: expense.id }).from(expense).where(eq(expense.id, id)).limit(1);
  return Boolean(row);
}

export async function POST(req: Request) {
  const me = await actor("billing");
  if (!me) return bad("You do not have access to do that.", 403);
  if (!r2PrivateConfigured) return bad("File storage is not configured yet.", 503);
  const rl = await rateLimit(`receipt:${me.id}`, RATE_LIMITS.uploadPresign);
  if (!rl.ok) return bad("Too many uploads. Wait a few minutes.", 429);

  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    const expenseId = String(form?.get("expenseId") ?? "");
    if (!(file instanceof File)) return bad("No file.");
    if (!(await exists(expenseId))) return bad("Expense not found.", 404);
    const type = file.type || "application/octet-stream";
    const problem = check(file.name, type, file.size) ?? (file.size > RELAY_MAX ? "This file is too large for the backup upload path. Try a smaller photo or PDF." : null);
    if (problem) return bad(problem);
    const key = `${RECEIPT_PREFIX(expenseId)}${Date.now()}-${slug(file.name)}`;
    await uploadPrivateObject(key, Buffer.from(await file.arrayBuffer()), type);
    return NextResponse.json({ ok: true, key });
  }

  const body = (await req.json().catch(() => ({}))) as { expenseId?: string; fileName?: string; contentType?: string; sizeBytes?: number };
  const { expenseId = "", fileName = "", contentType = "", sizeBytes = 0 } = body;
  if (!(await exists(expenseId))) return bad("Expense not found.", 404);
  const problem = check(fileName, contentType, Number(sizeBytes));
  if (problem) return bad(problem);
  const key = `${RECEIPT_PREFIX(expenseId)}${Date.now()}-${slug(fileName)}`;
  const uploadUrl = await presignPrivatePut(key, contentType, 60);
  return NextResponse.json({ ok: true, uploadUrl, key });
}
