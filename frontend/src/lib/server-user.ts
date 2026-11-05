import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { canAccess, homeFor, roleOf, type Area, type Role } from "@/lib/access";
import { sessionVerified, twoStepRequired, twoStepStateFor, type TwoStepState } from "@/lib/two-step";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string; // admin | staff | client — read it through roleOf()/currentRole()
  banned?: boolean;
  image?: string | null;
};

/** The raw Better Auth session (user + session row), deduped per request. */
export const getAuthSession = cache(async () => {
  try {
    return await auth.api.getSession({ headers: await headers() });
  } catch {
    return null;
  }
});

/**
 * Two-step hold for this request's session (lib/two-step.ts): admin and staff
 * sessions are held until the person has an authenticator AND this session
 * passed the second factor. Clients are never held.
 */
export const twoStepState = cache(async (): Promise<TwoStepState> => {
  const s = await getAuthSession();
  if (!s?.user) return "ok";
  const u = s.user as unknown as { role?: string; twoFactorEnabled?: boolean | null };
  const role = roleOf(u);
  if (!twoStepRequired(role)) return "ok";
  const enabled = Boolean(u.twoFactorEnabled);
  const verified = enabled ? await sessionVerified(s.session.id) : false;
  return twoStepStateFor({ role, enabled, verified });
});

/**
 * Signed-in user even while held at two-step — ONLY for the account pages
 * that complete enrolment/verification. Never use it to authorise anything.
 */
export const getAccountUser = cache(async (): Promise<(SessionUser & { twoFactorEnabled: boolean; sessionId: string }) | null> => {
  const s = await getAuthSession();
  if (!s?.user) return null;
  const u = s.user as unknown as SessionUser & { twoFactorEnabled?: boolean | null };
  return { ...u, twoFactorEnabled: Boolean(u.twoFactorEnabled), sessionId: s.session.id };
});

/**
 * Full session user (server components / route handlers), or null.
 * `cache` dedupes the lookup within one request, so a page that checks access
 * in its layout, page and actions only hits Better Auth once.
 *
 * A firm session held at two-step counts as SIGNED OUT here, so every page
 * guard, server action and route handler refuses it without knowing about
 * two-step at all; requireArea sends the person to finish it.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await getAuthSession();
  if (!session?.user) return null;
  if ((await twoStepState()) !== "ok") return null;
  return session.user as unknown as SessionUser;
});

export async function getCurrentUserId(): Promise<string | null> {
  const u = await getSessionUser();
  return u?.id ?? null;
}

export async function requireUserId(): Promise<string> {
  const id = await getCurrentUserId();
  if (!id) throw new Error("Unauthorized");
  return id;
}

/** The signed-in user's role, or null when signed out or banned. */
export async function currentRole(): Promise<Role | null> {
  const u = await getSessionUser();
  if (!u || u.banned) return null;
  return roleOf(u);
}

export async function isAdmin(): Promise<boolean> {
  return (await currentRole()) === "admin";
}

export async function isStaff(): Promise<boolean> {
  return (await currentRole()) === "staff";
}

/** Server-side area check for actions and route handlers. */
export async function hasAccess(area: Area): Promise<boolean> {
  const role = await currentRole();
  return role !== null && canAccess(role, area);
}

/**
 * Page guard: signed out → /login (with return path); wrong role → that role's
 * own home. Returns the user so the page can use it.
 */
export async function requireArea(area: Area, returnTo?: string): Promise<SessionUser & { role: Role }> {
  const u = await getSessionUser();
  if (!u) {
    const hold = await twoStepState();
    const next = returnTo ? `?next=${encodeURIComponent(returnTo)}` : "";
    if (hold === "enrol") redirect(`/account/two-step${next}`);
    if (hold === "verify") redirect(`/account/two-step/verify${next}`);
    redirect(returnTo ? `/login?redirect=${encodeURIComponent(returnTo)}` : "/login");
  }
  if (u.banned) redirect("/login?banned=1");
  const role = roleOf(u);
  if (!canAccess(role, area)) redirect(homeFor(role));
  return { ...u, role };
}

/**
 * Can the current user work on this request? Admins: any. Staff: only when
 * assigned (request_assignment). Clients never use the firm workspace.
 */
export async function canWorkOnRequest(requestId: string): Promise<boolean> {
  const u = await getSessionUser();
  if (!u || u.banned) return false;
  const role = roleOf(u);
  if (role === "admin") return true;
  if (role !== "staff") return false;
  const { db } = await import("@/lib/db/client");
  const { requestAssignment } = await import("@/lib/db/schema");
  const [row] = await db
    .select({ id: requestAssignment.id })
    .from(requestAssignment)
    .where(and(eq(requestAssignment.requestId, requestId), eq(requestAssignment.userId, u.id)))
    .limit(1);
  return Boolean(row);
}
