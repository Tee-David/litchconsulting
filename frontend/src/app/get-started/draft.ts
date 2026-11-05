import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { client, requestDraft } from "@/lib/db/schema";

/**
 * Request drafts (R1.6): the service a visitor picks BEFORE they have an
 * account, saved on the server so it survives verifying on another device.
 * The draft id rides in the sign-up's verification link; after verification
 * /account/continue claims it for the new user and opens the request flow
 * pre-filled.
 */

export type DraftAnswers = { details?: string; timeline?: string; companySize?: string; company?: string; consentAt?: string; consentVersion?: string };
export type DraftRow = typeof requestDraft.$inferSelect;

/** Drafts older than this are not claimable (a stale pick never resurfaces). */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const isDraftId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export async function createDraft(input: { serviceSlug: string | null; answers?: DraftAnswers; email?: string | null }): Promise<DraftRow> {
  const [row] = await db
    .insert(requestDraft)
    .values({ serviceSlug: input.serviceSlug, answers: input.answers ?? {}, email: input.email?.trim().toLowerCase() || null })
    .returning();
  return row;
}

/** An unclaimed, fresh draft by id (public: the id is an unguessable uuid). */
export async function openDraft(id: string): Promise<DraftRow | null> {
  if (!isDraftId(id)) return null;
  const [row] = await db
    .select()
    .from(requestDraft)
    .where(and(eq(requestDraft.id, id), isNull(requestDraft.claimedByUserId), gt(requestDraft.createdAt, new Date(Date.now() - MAX_AGE_MS))))
    .limit(1);
  return row ?? null;
}

/** Update an unclaimed draft (service change, details, the email/company typed at sign-up). */
export async function updateDraft(id: string, patch: { serviceSlug?: string | null; answers?: DraftAnswers; email?: string | null }): Promise<DraftRow | null> {
  const current = await openDraft(id);
  if (!current) return null;
  const answers = { ...((current.answers as DraftAnswers) ?? {}), ...(patch.answers ?? {}) };
  const [row] = await db
    .update(requestDraft)
    .set({
      ...(patch.serviceSlug !== undefined ? { serviceSlug: patch.serviceSlug } : {}),
      ...(patch.email !== undefined ? { email: patch.email?.trim().toLowerCase() || null } : {}),
      answers,
      updatedAt: new Date(),
    })
    .where(and(eq(requestDraft.id, id), isNull(requestDraft.claimedByUserId)))
    .returning();
  return row ?? null;
}

/**
 * Claim a draft for a signed-in user. Idempotent: the same user claiming
 * again gets the same draft back; someone else gets null. A company typed at
 * sign-up fills the client record when it is still blank.
 */
export async function claimDraft(id: string, u: { id: string; email: string; name: string }): Promise<DraftRow | null> {
  if (!isDraftId(id)) return null;
  const [mine] = await db.select().from(requestDraft).where(and(eq(requestDraft.id, id), eq(requestDraft.claimedByUserId, u.id))).limit(1);
  let row = mine ?? null;
  if (!row) {
    const [claimed] = await db
      .update(requestDraft)
      .set({ claimedByUserId: u.id, claimedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(requestDraft.id, id), isNull(requestDraft.claimedByUserId), gt(requestDraft.createdAt, new Date(Date.now() - MAX_AGE_MS))))
      .returning();
    row = claimed ?? null;
  }
  if (!row) return null;
  const consent = (row.answers as DraftAnswers) ?? {};
  if (!mine && consent.consentAt) {
    const { recordAudit } = await import("@/lib/audit");
    await recordAudit({ action: "user.consent", entity: "user", entityId: u.id, actorId: u.id, actorName: u.name || u.email, meta: { at: consent.consentAt, version: consent.consentVersion } });
  }
  const company = ((row.answers as DraftAnswers) ?? {}).company?.trim();
  if (company) {
    const { getClientForUser } = await import("@/lib/db/queries/clients");
    const c = await getClientForUser(u.id, u.email, u.name);
    if (!c.company) await db.update(client).set({ company: company.slice(0, 160), updatedAt: new Date() }).where(and(eq(client.id, c.id), sql`${client.company} IS NULL`));
  }
  return row;
}

/** A draft this user already claimed (for the resume page). */
export async function claimedDraft(id: string, userId: string): Promise<DraftRow | null> {
  if (!isDraftId(id)) return null;
  const [row] = await db.select().from(requestDraft).where(and(eq(requestDraft.id, id), eq(requestDraft.claimedByUserId, userId))).limit(1);
  return row ?? null;
}
