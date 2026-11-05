import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessionTwoStep } from "@/lib/db/schema";
import type { Role } from "@/lib/access";

/**
 * Two-step sign-in policy (Tee-David, 2026-11-04): REQUIRED for admin and
 * staff, optional for clients, enforced on the server.
 *
 * Better Auth's twoFactor plugin stores the authenticator secret and backup
 * codes and challenges email+password sign-ins. It does not challenge Google
 * sign-ins, and it knows nothing about roles, so we keep one more fact per
 * session: "this session passed the second factor" (`session_two_step`).
 *
 *   firm user, no authenticator yet      → "enrol"  (held at /account/two-step)
 *   firm user, session not yet verified  → "verify" (held at /account/two-step/verify)
 *   otherwise                            → "ok"
 *
 * `requireArea` and `currentRole` (lib/server-user.ts) consult this, so a held
 * session can neither open a firm page nor run a firm server action.
 */

export type TwoStepState = "ok" | "enrol" | "verify";

export const twoStepRequired = (role: Role) => role === "admin" || role === "staff";

export async function sessionVerified(sessionId: string): Promise<boolean> {
  try {
    const [row] = await db.select({ id: sessionTwoStep.sessionId }).from(sessionTwoStep).where(eq(sessionTwoStep.sessionId, sessionId)).limit(1);
    return Boolean(row);
  } catch (err) {
    // Fail closed for the firm workspace: a DB error must not wave a session through.
    console.error("[two-step] lookup failed:", err);
    return false;
  }
}

export async function markSessionVerified(sessionId: string, userId: string): Promise<void> {
  await db.insert(sessionTwoStep).values({ sessionId, userId }).onConflictDoNothing();
}

export function twoStepStateFor(input: { role: Role; enabled: boolean; verified: boolean }): TwoStepState {
  if (!twoStepRequired(input.role) && !input.enabled) return "ok";
  if (!input.enabled) return "enrol";
  // Clients who turned it on are challenged by Better Auth on password sign-in;
  // the per-session hold is only enforced for the firm.
  if (!twoStepRequired(input.role)) return "ok";
  return input.verified ? "ok" : "verify";
}

/**
 * Admin reset (Settings → Access): remove the authenticator and backup codes,
 * forget verified sessions and sign the person out everywhere. On their next
 * sign-in they enrol again.
 */
export async function resetTwoStep(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM "twoFactor" WHERE "userId" = ${userId}`);
    await tx.execute(sql`UPDATE "user" SET "twoFactorEnabled" = false WHERE "id" = ${userId}`);
    await tx.delete(sessionTwoStep).where(eq(sessionTwoStep.userId, userId));
    await tx.execute(sql`DELETE FROM "session" WHERE "userId" = ${userId}`);
  });
}

/** Two-step status for many users (team table). */
export async function twoStepEnabledFor(userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const rows = await db.execute<{ id: string }>(
    sql`SELECT "id" FROM "user" WHERE "twoFactorEnabled" = true AND "id" IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`,
  );
  return new Set(rows.rows.map((r) => r.id));
}

export async function forgetVerifiedSession(sessionId: string, userId: string) {
  await db.delete(sessionTwoStep).where(and(eq(sessionTwoStep.sessionId, sessionId), eq(sessionTwoStep.userId, userId)));
}
