"use server";

import { revalidatePath } from "next/cache";
import { eq, sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orgSettings, user } from "@/lib/db/schema";
import { isAdmin as checkIsAdmin } from "@/lib/server-user";
import { auth } from "@/lib/auth";

type ActionResult = { ok: boolean; error?: string };

export type OrgSettingsInput = {
  companyName?: string;
  logoUrl?: string;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  invoiceFromEmail?: string;
  defaultCurrency?: string;
  invoiceTerms?: string;
};

const clean = (v?: string) => (v && v.trim() ? v.trim() : null);

/** Upsert the singleton org settings row (id="default"). */
export async function saveOrgSettingsAction(input: OrgSettingsInput): Promise<ActionResult> {
  if (!(await checkIsAdmin())) return { ok: false, error: "Unauthorized" };

  const fields = {
    companyName: clean(input.companyName),
    logoUrl: clean(input.logoUrl),
    bankName: clean(input.bankName),
    accountName: clean(input.accountName),
    accountNumber: clean(input.accountNumber),
    invoiceFromEmail: clean(input.invoiceFromEmail),
    defaultCurrency: clean(input.defaultCurrency),
    invoiceTerms: clean(input.invoiceTerms),
    updatedAt: new Date(),
  };

  const [existing] = await db.select({ id: orgSettings.id }).from(orgSettings).where(eq(orgSettings.id, "default")).limit(1);
  if (existing) {
    await db.update(orgSettings).set(fields).where(eq(orgSettings.id, "default"));
  } else {
    await db.insert(orgSettings).values({ id: "default", ...fields });
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin/finance/invoices");
  revalidatePath("/admin/finance/quotes");
  revalidatePath("/admin/finance/receipts");
  return { ok: true };
}

/** Create a new administrator user. */
export async function createAdminUserAction(input: {
  name: string;
  email: string;
  password?: string;
}): Promise<ActionResult & { userId?: string }> {
  if (!(await checkIsAdmin())) return { ok: false, error: "Unauthorized" };

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password || Math.random().toString(36).slice(-10) + "A1!";

  if (!name || !email) {
    return { ok: false, error: "Name and email are required" };
  }

  try {
    const signup = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
        role: "admin",
      },
    });

    if (!signup?.user) {
      return { ok: false, error: "Could not create user" };
    }

    revalidatePath("/admin/settings");
    return { ok: true, userId: signup.user.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

/** Delete a user by ID. */
export async function deleteUserAction(userId: string): Promise<ActionResult> {
  if (!(await checkIsAdmin())) return { ok: false, error: "Unauthorized" };

  try {
    // Cascading delete across Better Auth tables for this user via database transactions
    await db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM "session" WHERE "userId" = ${userId} OR "user_id" = ${userId}`);
      await tx.execute(sql`DELETE FROM "account" WHERE "userId" = ${userId} OR "user_id" = ${userId}`);
      await tx.execute(sql`DELETE FROM "user" WHERE "id" = ${userId}`);
    });

    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not delete user" };
  }
}

/** Toggle banned state for a user. */
export async function toggleUserBanAction(userId: string, isBanned: boolean): Promise<ActionResult> {
  if (!(await checkIsAdmin())) return { ok: false, error: "Unauthorized" };

  try {
    await db.update(user).set({ banned: isBanned }).where(eq(user.id, userId));
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not update user status" };
  }
}

/** Change a user's role. */
export async function changeUserRoleAction(userId: string, role: string): Promise<ActionResult> {
  if (!(await checkIsAdmin())) return { ok: false, error: "Unauthorized" };

  try {
    await db.update(user).set({ role }).where(eq(user.id, userId));
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not update user role" };
  }
}

/** Bulk delete users. */
export async function bulkDeleteUsersAction(userIds: string[]): Promise<ActionResult> {
  if (!(await checkIsAdmin())) return { ok: false, error: "Unauthorized" };
  if (!userIds || userIds.length === 0) return { ok: true };

  try {
    await db.transaction(async (tx) => {
      // Clean up sessions and accounts
      await tx.execute(sql`DELETE FROM "session" WHERE "userId" IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)}) OR "user_id" IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`);
      await tx.execute(sql`DELETE FROM "account" WHERE "userId" IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)}) OR "user_id" IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`);
      await tx.delete(user).where(inArray(user.id, userIds));
    });

    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not delete users" };
  }
}

/** Bulk toggle banned state for users. */
export async function bulkToggleBanUsersAction(userIds: string[], isBanned: boolean): Promise<ActionResult> {
  if (!(await checkIsAdmin())) return { ok: false, error: "Unauthorized" };
  if (!userIds || userIds.length === 0) return { ok: true };

  try {
    await db.update(user).set({ banned: isBanned }).where(inArray(user.id, userIds));
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not update users status" };
  }
}

/** Bulk change roles for users. */
export async function bulkChangeRoleUsersAction(userIds: string[], role: string): Promise<ActionResult> {
  if (!(await checkIsAdmin())) return { ok: false, error: "Unauthorized" };
  if (!userIds || userIds.length === 0) return { ok: true };

  try {
    await db.update(user).set({ role }).where(inArray(user.id, userIds));
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not update users roles" };
  }
}
