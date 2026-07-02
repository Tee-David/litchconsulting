import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string; // "admin" | "client"
  banned?: boolean;
  image?: string | null;
};

/** Full session user (server components / route handlers), or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return session.user as unknown as SessionUser;
}

export async function getCurrentUserId(): Promise<string | null> {
  const u = await getSessionUser();
  return u?.id ?? null;
}

export async function requireUserId(): Promise<string> {
  const id = await getCurrentUserId();
  if (!id) throw new Error("Unauthorized");
  return id;
}

export async function isAdmin(): Promise<boolean> {
  const u = await getSessionUser();
  return u?.role === "admin";
}
