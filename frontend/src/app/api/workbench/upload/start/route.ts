import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSessionUser } from "@/lib/server-user";
import { roleOf } from "@/lib/access";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { presignPrivatePut, r2PrivateConfigured } from "@/lib/r2";
import { WB_MAX_BYTES, WB_MIME, stageToken, uploadTarget } from "@/lib/workbench/upload-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Step 1 of a large or archive upload (up to 20 MB, ZIP / RAR / 7z too): checks who
 * may add the file, then gives the browser a 5-minute link to put it straight into
 * the private bucket (the serverless request limit is 4.5 MB). Step 2 is /finish.
 */
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: Request) {
  const u = await getSessionUser();
  if (!u || u.banned || !["admin", "staff"].includes(roleOf(u))) return bad("You do not have access to the workbench.", 403);
  if (!r2PrivateConfigured) return bad("File storage is not set up yet.", 503);
  const rl = await rateLimit(`wb-upload:${u.id}`, RATE_LIMITS.uploadPresign);
  if (!rl.ok) return bad("Too many uploads. Wait a few minutes.", 429);

  const body = (await req.json().catch(() => null)) as { name?: string; size?: number; conversationId?: string; requestId?: string } | null;
  const name = String(body?.name ?? "").slice(0, 200);
  const size = Number(body?.size ?? 0);
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const mime = WB_MIME[ext];
  if (!name || !mime) return bad("The workbench opens XLSX, XLS, ODS, CSV, TSV, TXT, JSON, DOCX, PDF, PNG and JPG files, and ZIP, RAR or 7z archives of them.");
  if (!(size > 0) || size > WB_MAX_BYTES) return bad("Each file must be 20 MB or smaller.");

  const t = await uploadTarget(u, body?.conversationId || null, body?.requestId || null);
  if ("error" in t) return bad(t.error, t.status);

  const safe = name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "file";
  const key = `wb-staging/${randomUUID()}/${safe}`;
  const exp = Date.now() + 15 * 60_000;
  const url = await presignPrivatePut(key, mime, 300);
  return NextResponse.json({ ok: true, url, key, exp, token: stageToken(u.id, key, exp), contentType: mime });
}
