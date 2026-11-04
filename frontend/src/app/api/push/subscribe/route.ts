import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pushSubscription } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/server-user";
import { pushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * Web-push subscription management for ANY signed-in user (admins, staff and
 * clients — notifyUsers decides who gets which push per preference). GET
 * exposes the VAPID public key; POST/DELETE register or remove this browser's
 * endpoint. DELETE only removes the caller's own subscription.
 */

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.banned) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!pushConfigured()) {
    return NextResponse.json({ ok: false, error: "Push isn't configured (VAPID keys missing)." });
  }
  return NextResponse.json({ ok: true, publicKey: process.env.VAPID_PUBLIC_KEY });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || user.banned) {
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
  if (!user || user.banned) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
  if (body.endpoint) {
    await db
      .delete(pushSubscription)
      .where(and(eq(pushSubscription.endpoint, body.endpoint), eq(pushSubscription.userId, user.id)));
  }
  return NextResponse.json({ ok: true });
}
