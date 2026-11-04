import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { reviewRound, serviceRequest, serviceRequestDocument, serviceRequestEvent } from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit";
import { notifyClient, notifyFirm, simpleEmail } from "@/lib/requests/people";

/**
 * Draft review rounds.
 *   firm sends a draft  → request client_review, review_round(n) opened     sendDraftForReview()
 *   client approves     → round approved, request delivered                 decideReview("approved")
 *   client asks changes → round changes (+comments), request in_progress    decideReview("changes")
 *     (the next draft opens round n+1)
 * Callers check access first (canWorkOnRequest for the firm; ownership for the client).
 */

export const INCLUDED_ROUNDS = 3;

export type ReviewComment = { text: string; anchor?: string };

export async function currentRound(requestId: string) {
  const [r] = await db.select().from(reviewRound).where(eq(reviewRound.requestId, requestId)).orderBy(desc(reviewRound.round)).limit(1);
  return r ?? null;
}

export async function listRounds(requestId: string) {
  return db.select().from(reviewRound).where(eq(reviewRound.requestId, requestId)).orderBy(desc(reviewRound.round));
}

export async function sendDraftForReview(input: {
  requestId: string;
  documentId: string;
  note?: string;
  actor: { userId: string; name: string };
}): Promise<{ ok: true; round: number } | { ok: false; error: string }> {
  const [req] = await db.select().from(serviceRequest).where(and(eq(serviceRequest.id, input.requestId), isNull(serviceRequest.deletedAt)));
  if (!req) return { ok: false, error: "Request not found." };
  if (!["in_progress", "in_review"].includes(req.status)) {
    return { ok: false, error: req.status === "client_review" ? "A draft is already with the client." : "Drafts can be sent while the work is in progress." };
  }
  const [doc] = await db
    .select()
    .from(serviceRequestDocument)
    .where(and(eq(serviceRequestDocument.id, input.documentId), eq(serviceRequestDocument.requestId, req.id), eq(serviceRequestDocument.kind, "deliverable")));
  if (!doc) return { ok: false, error: "Pick a deliverable on this request." };

  const round = req.reviewRound + 1;
  await db.transaction(async (tx) => {
    await tx.update(serviceRequestDocument).set({ stage: "draft" }).where(eq(serviceRequestDocument.id, doc.id));
    await tx.insert(reviewRound).values({ requestId: req.id, round, documentId: doc.id }).onConflictDoNothing();
    await tx.update(serviceRequest).set({ status: "client_review", reviewRound: round, updatedAt: new Date() }).where(eq(serviceRequest.id, req.id));
    await tx.insert(serviceRequestEvent).values({
      requestId: req.id,
      type: "status_changed",
      fromStatus: req.status,
      toStatus: "client_review",
      message: `Draft ${round} is ready for your review (${doc.fileName}).${input.note ? ` ${input.note}` : ""}`,
      visibility: "client",
      actorRole: "admin",
      actorName: input.actor.name,
    });
  });
  await recordAudit({ actorId: input.actor.userId, actorName: input.actor.name, action: "request.draft_sent", entity: "service_request", entityId: req.id, meta: { round, documentId: doc.id } });
  const link = `/dashboard/requests/${req.id}/review`;
  await notifyClient(req.clientId, {
    category: "actions",
    title: `Draft ${round} of ${req.serviceName} is ready for your review`,
    body: round <= INCLUDED_ROUNDS ? `Round ${round} of ${INCLUDED_ROUNDS} included. Approve it or tell us what to change.` : "Approve it or tell us what to change.",
    link,
    dedupeKey: `draft-sent:${req.id}:${round}`,
    email: await simpleEmail({
      subject: `Your draft is ready to review — ${req.number}`,
      heading: "Your draft is ready",
      body: `${input.actor.name} sent draft ${round} of ${req.serviceName}. Have a look, then approve it or tell us what to change.`,
      href: link,
      cta: "Review draft",
    }),
  });
  return { ok: true, round };
}

export async function decideReview(input: {
  requestId: string;
  clientId: string;
  decision: "approved" | "changes";
  comments: ReviewComment[];
  actor: { userId: string; name: string };
}): Promise<{ ok: true; round: number } | { ok: false; error: string }> {
  const [req] = await db
    .select()
    .from(serviceRequest)
    .where(and(eq(serviceRequest.id, input.requestId), eq(serviceRequest.clientId, input.clientId), isNull(serviceRequest.deletedAt)));
  if (!req) return { ok: false, error: "Request not found." };
  if (req.status !== "client_review") return { ok: false, error: "There is no draft waiting for your review." };
  const round = await currentRound(req.id);
  if (!round || round.decision) return { ok: false, error: "There is no open review round." };
  const comments = input.comments.map((c) => ({ text: c.text.trim().slice(0, 2000), anchor: c.anchor?.slice(0, 200) })).filter((c) => c.text);
  if (input.decision === "changes" && !comments.length) return { ok: false, error: "Tell us what to change." };

  const approved = input.decision === "approved";
  const now = new Date();
  const ok = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(reviewRound)
      .set({ decision: input.decision, comments, decidedAt: now, decidedBy: input.actor.userId })
      .where(and(eq(reviewRound.id, round.id), isNull(reviewRound.decision)))
      .returning({ id: reviewRound.id });
    if (!claimed.length) return false;
    await tx
      .update(serviceRequest)
      .set(approved ? { status: "delivered", deliveredAt: now, updatedAt: now } : { status: "in_progress", updatedAt: now })
      .where(eq(serviceRequest.id, req.id));
    await tx.insert(serviceRequestEvent).values({
      requestId: req.id,
      type: "status_changed",
      fromStatus: "client_review",
      toStatus: approved ? "delivered" : "in_progress",
      message: approved
        ? `You approved draft ${round.round}. We are preparing the final files.`
        : `You asked for changes on draft ${round.round}: ${comments.map((c) => (c.anchor ? `${c.anchor}: ${c.text}` : c.text)).join(" · ")}`,
      visibility: "client",
      actorRole: "client",
      actorName: input.actor.name,
    });
    return true;
  });
  if (!ok) return { ok: false, error: "This round was already decided." };

  await recordAudit({ actorId: input.actor.userId, actorName: input.actor.name, action: `request.review_${input.decision}`, entity: "service_request", entityId: req.id, meta: { round: round.round, comments: comments.length } });
  await notifyFirm(req.id, {
    category: approved ? "progress" : "actions",
    title: approved ? `${req.number}: draft ${round.round} approved` : `${req.number}: changes asked on draft ${round.round}`,
    body: approved ? "Send the final files." : comments[0]?.text,
    dedupeKey: `review-${input.decision}:${req.id}:${round.round}`,
  });
  return { ok: true, round: round.round };
}
