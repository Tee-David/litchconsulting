"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { client } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/server-user";
import { getClientForUser } from "@/lib/db/queries/clients";

type ActionResult = { ok: boolean; error?: string };

export async function updateClientSettingsAction(input: {
  company?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  name?: string;
}): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user || user.role !== "client") return { ok: false, error: "Unauthorized" };

  const clientRow = await getClientForUser(user.id, user.email, user.name);

  await db
    .update(client)
    .set({
      name: input.name?.trim() || clientRow.name,
      company: input.company?.trim() || null,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      taxId: input.taxId?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(client.id, clientRow.id));

  revalidatePath("/dashboard/settings");
  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${clientRow.id}`);
  return { ok: true };
}
