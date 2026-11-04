"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPortal } from "@/lib/requests/portal";
import { supplyItem } from "@/lib/requests/items";
import { decideReview } from "@/lib/requests/review";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { serviceRequest, serviceRequestEvent } from "@/lib/db/schema";
import { notifyFirm } from "@/lib/requests/people";

/**
 * Client actions for asks (request_item) and draft review rounds. Each one
 * resolves the client from the session and re-checks ownership in lib.
 */

type Result = { ok: true; message?: string } | { ok: false; error: string };

function revalidate(requestId?: string) {
  revalidatePath("/dashboard", "layout");
  if (requestId) revalidatePath(`/dashboard/requests/${requestId}`);
}

const supplySchema = z.object({
  itemId: z.string().uuid(),
  requestId: z.string().uuid(),
  answer: z.string().max(4000).optional(),
  notAvailable: z.boolean().optional(),
  document: z
    .object({ fileName: z.string().min(1).max(200), contentType: z.string().max(200).nullable().optional(), sizeBytes: z.number().int().positive().max(25 * 1024 * 1024), r2Key: z.string().min(1).max(500) })
    .optional(),
});

export async function supplyItemAction(input: z.infer<typeof supplySchema>): Promise<Result> {
  const portal = await getPortal();
  if (!portal) return { ok: false, error: "Sign in again to continue." };
  const parsed = supplySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check your answer and try again." };
  const rl = await rateLimit(`supply:${portal.user.id}`, RATE_LIMITS.upload);
  if (!rl.ok) return { ok: false, error: "Too many attempts. Wait a minute and try again." };
  const r = await supplyItem({ ...parsed.data, clientId: portal.client.id, actor: { userId: portal.user.id, name: portal.client.name || portal.user.name } });
  if (!r.ok) return r;
  revalidate(parsed.data.requestId);
  return { ok: true, message: parsed.data.notAvailable ? "Sent. We will find another way." : "Sent. It shows as supplied until we check it." };
}

/** Client message on a request: event + bell/email to the assigned staff and admins. */
export async function sendRequestMessageAction(requestId: string, body: string): Promise<Result> {
  const portal = await getPortal();
  if (!portal) return { ok: false, error: "Sign in again to continue." };
  const text = String(body ?? "").trim();
  if (!z.string().uuid().safeParse(requestId).success) return { ok: false, error: "Request not found." };
  if (!text) return { ok: false, error: "Write a message first." };
  if (text.length > 4000) return { ok: false, error: "Keep it under 4,000 characters." };
  const rl = await rateLimit(`msg:${portal.user.id}`, RATE_LIMITS.upload);
  if (!rl.ok) return { ok: false, error: "Too many messages. Wait a minute and try again." };
  const [req] = await db
    .select()
    .from(serviceRequest)
    .where(and(eq(serviceRequest.id, requestId), eq(serviceRequest.clientId, portal.client.id), isNull(serviceRequest.deletedAt)));
  if (!req) return { ok: false, error: "Request not found." };
  const author = portal.client.name || portal.user.name;
  await db.insert(serviceRequestEvent).values({ requestId, type: "message", message: text, visibility: "client", actorRole: "client", actorName: author });
  await notifyFirm(requestId, {
    category: "support",
    title: `${req.number}: new message from ${portal.client.company || author}`,
    body: text.slice(0, 200),
    dedupeKey: `client-msg:${requestId}:${Date.now()}`,
    staffLink: `/work/conversations?r=${requestId}`,
  });
  revalidate(requestId);
  return { ok: true };
}

const reviewSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["approved", "changes"]),
  comments: z.array(z.object({ text: z.string().max(2000), anchor: z.string().max(200).optional() })).max(30),
});

export async function decideReviewAction(input: z.infer<typeof reviewSchema>): Promise<Result & { round?: number }> {
  const portal = await getPortal();
  if (!portal) return { ok: false, error: "Sign in again to continue." };
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check your comments and try again." };
  const r = await decideReview({ ...parsed.data, clientId: portal.client.id, actor: { userId: portal.user.id, name: portal.client.name || portal.user.name } });
  if (!r.ok) return r;
  revalidate(parsed.data.requestId);
  return {
    ok: true,
    round: r.round,
    message: parsed.data.decision === "approved" ? "Approved. We are preparing the final files." : `Sent. This used round ${r.round}.`,
  };
}
