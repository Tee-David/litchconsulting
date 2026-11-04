import { NextResponse } from "next/server";
import { retryFailedEmails } from "@/lib/email";

export const dynamic = "force-dynamic";
// A batch of slow SMTP handshakes (~20s each on this host) needs headroom.
export const maxDuration = 300;

/**
 * Email outbox retry (Vercel Cron, see vercel.json). Resends `failed` rows
 * that are replayable (no attachments), under MAX_ATTEMPTS, from the last 3
 * days. Each row is claimed before it is resent, so overlapping runs are safe.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await retryFailedEmails(10);
  return NextResponse.json({ ok: true, ...result });
}
