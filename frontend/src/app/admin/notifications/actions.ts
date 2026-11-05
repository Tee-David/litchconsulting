"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CATEGORIES, markRead, setPref } from "@/lib/notifications";
import { getSessionUser } from "@/lib/server-user";

type Res = { ok: true } | { ok: false; error: string };

/** Mark the signed-in user's notifications read (some, or all). Scoped to the user. */
export async function markReadAction(ids?: string[]): Promise<Res> {
  const u = await getSessionUser();
  if (!u || u.banned) return { ok: false, error: "Sign in again to continue." };
  const parsed = z.array(z.string().uuid()).max(500).optional().safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Unknown notification." };
  await markRead(u.id, parsed.data);
  revalidatePath("/admin/notifications");
  return { ok: true };
}

const prefSchema = z.object({
  category: z.enum(Object.keys(CATEGORIES) as [keyof typeof CATEGORIES, ...Array<keyof typeof CATEGORIES>]),
  mode: z.enum(["immediate", "digest", "off"]),
  email: z.boolean(),
  push: z.boolean(),
});

/** Save one category's delivery preference for the signed-in user. */
export async function savePrefAction(input: z.infer<typeof prefSchema>): Promise<Res> {
  const u = await getSessionUser();
  if (!u || u.banned) return { ok: false, error: "Sign in again to continue." };
  const parsed = prefSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Unknown setting." };
  await setPref(u.id, parsed.data);
  revalidatePath("/admin/notifications");
  return { ok: true };
}
