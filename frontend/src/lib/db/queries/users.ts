import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { user, type User } from "@/lib/db/schema";

/**
 * Better Auth user lookups (the auth tables are owned by Better Auth; this is
 * read-only). Used to derive a client's portal-account status on the admin
 * client hub.
 */
export async function getUserByIdOrEmail(
  userId?: string | null,
  email?: string | null
): Promise<User | null> {
  if (userId) {
    const [byId] = await db.select().from(user).where(eq(user.id, userId));
    if (byId) return byId;
  }
  if (email) {
    const [byEmail] = await db
      .select()
      .from(user)
      .where(sql`lower(${user.email}) = ${email.toLowerCase()}`);
    if (byEmail) return byEmail;
  }
  return null;
}

export type PortalStatus = "no-account" | "banned" | "unverified" | "active";

export function portalStatusOf(u: User | null): PortalStatus {
  if (!u) return "no-account";
  if (u.banned) return "banned";
  if (!u.emailVerified) return "unverified";
  return "active";
}
