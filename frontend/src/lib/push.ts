import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pushSubscription, user } from "@/lib/db/schema";

/**
 * Web push (VAPID) — admin alerting channel. Degrades to a no-op when the
 * VAPID keys aren't configured; email (lib/notify.ts) remains the guaranteed
 * channel. Generate keys once with: npx web-push generate-vapid-keys
 */

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

async function webpush() {
  const mod = await import("web-push");
  const wp = mod.default ?? mod;
  wp.setVapidDetails(
    `mailto:${process.env.CONTACT_TO_EMAIL || "hello@litchconsulting.com"}`,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  return wp;
}

export type PushPayload = { title: string; body?: string; url?: string };

/** Send a push to every subscribed admin browser. Dead endpoints are pruned. */
export async function pushAdmins(payload: PushPayload): Promise<void> {
  if (!pushConfigured()) return;
  const admins = await db.select({ id: user.id }).from(user).where(eq(user.role, "admin"));
  if (admins.length === 0) return;
  const subs = await db
    .select()
    .from(pushSubscription)
    .where(inArray(pushSubscription.userId, admins.map((a) => a.id)));
  if (subs.length === 0) return;

  const wp = await webpush();
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await wp.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await db.delete(pushSubscription).where(eq(pushSubscription.id, sub.id));
        }
      }
    })
  );
}
