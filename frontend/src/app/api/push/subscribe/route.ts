import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pushSubscription } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/server-user";
import { pushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * Web-push subscription management (admin alerting, v1). GET exposes the
 * VAPID public key; POST/DELETE register or remove this browser's endpoint.
 */

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!pushConfigured()) {
    return NextResponse.json({ ok: false, error: "Push isn't configured (VAPID keys missing)." });
  }
  return NextResponse.json({ ok: true, publicKey: process.env.VAPID_PUBLIC_KEY });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ ok: false, error: "Invalid subscription" }, { status: 400 });
  }

  await db
    .insert(pushSubscription)
    .values({
      userId: user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: { userId: user.id, p256dh: body.keys.p256dh, auth: body.keys.auth },
    });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
  if (body.endpoint) {
    await db.delete(pushSubscription).where(eq(pushSubscription.endpoint, body.endpoint));
  }
  return NextResponse.json({ ok: true });
}
