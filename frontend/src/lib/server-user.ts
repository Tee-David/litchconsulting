import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { canAccess, homeFor, roleOf, type Area, type Role } from "@/lib/access";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string; // admin | staff | client — read it through roleOf()/currentRole()
  banned?: boolean;
  image?: string | null;
};

/**
 * Full session user (server components / route handlers), or null.
 * `cache` dedupes the lookup within one request, so a page that checks access
 * in its layout, page and actions only hits Better Auth once.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
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
  if (!u) redirect(returnTo ? `/login?redirect=${encodeURIComponent(returnTo)}` : "/login");
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
