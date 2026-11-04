import "server-only";
import { getSessionUser, type SessionUser } from "@/lib/server-user";
import { canAccess, roleOf, type Area } from "@/lib/access";

export type ActionResult<T = object> = ({ ok: true; message?: string; undoId?: string } & T) | { ok: false; error: string };

/**
 * Server-action guard: the signed-in, unbanned user, when their role may use
 * `area`; otherwise null. Every admin action calls this first — hiding a
 * button is never the security boundary.
 */
export async function actor(area: Area): Promise<(SessionUser & { displayName: string }) | null> {
  const u = await getSessionUser();
  if (!u || u.banned) return null;
  if (!canAccess(roleOf(u), area)) return null;
  return { ...u, displayName: u.name || u.email };
}

export const DENIED = { ok: false as const, error: "You do not have access to do that." };

/** Turn a thrown error into words a person can act on. */
export function failure(err: unknown, fallback = "That did not work. Try again."): { ok: false; error: string } {
  console.error("[admin action]", err);
  if (err instanceof Error && err.message && err.message.length < 160 && !/sql|syntax|relation|column/i.test(err.message)) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: fallback };
}
