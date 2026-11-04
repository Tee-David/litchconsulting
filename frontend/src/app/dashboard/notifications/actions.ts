"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { client } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/server-user";
import { roleOf } from "@/lib/access";
import { CATEGORIES, markRead, setPref, unreadCount, type NotifyCategory } from "@/lib/notifications";
import { getPortal } from "@/lib/requests/portal";

/**
 * Notification centre actions, shared by the client portal and the staff
 * workspace. Every action works on the signed-in user's own rows only.
 */

type Result = { ok: true; unread?: number } | { ok: false; error: string };

export async function markReadAction(ids?: string[]): Promise<Result> {
  const u = await getSessionUser();
  if (!u || u.banned) return { ok: false, error: "Sign in again to continue." };
  const parsed = z.array(z.string().uuid()).max(200).optional().safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Those notifications could not be found." };
  await markRead(u.id, parsed.data);
  revalidatePath("/dashboard", "layout");
  revalidatePath("/work", "layout");
  return { ok: true, unread: await unreadCount(u.id) };
}

const prefSchema = z.object({
  category: z.enum(Object.keys(CATEGORIES) as [NotifyCategory, ...NotifyCategory[]]),
  mode: z.enum(["immediate", "digest", "off"]),
  email: z.boolean(),
  push: z.boolean(),
});

export async function setPrefAction(input: z.infer<typeof prefSchema>): Promise<Result> {
  const u = await getSessionUser();
  if (!u || u.banned) return { ok: false, error: "Sign in again to continue." };
  const parsed = prefSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That setting is not valid." };
  // Things that need the client by a date can't be silenced completely.
  if (roleOf(u) === "client" && parsed.data.category === "actions" && parsed.data.mode === "off") {
    return { ok: false, error: "Actions can be sent as a daily digest, but not turned off. Some need you by a date." };
  }
  try {
    await setPref(u.id, parsed.data);
  } catch {
    return { ok: false, error: "Could not save that setting. Try again." };
  }
  return { ok: true };
}

/** The weekly summary email (client.digest_opt_out), folded into preferences. */
export async function setWeeklySummaryAction(on: boolean): Promise<Result> {
  const portal = await getPortal();
  if (!portal) return { ok: false, error: "Only client accounts get the weekly summary." };
  await db.update(client).set({ digestOptOut: !on, updatedAt: new Date() }).where(eq(client.id, portal.client.id));
  revalidatePath("/dashboard/notifications");
  return { ok: true };
}
