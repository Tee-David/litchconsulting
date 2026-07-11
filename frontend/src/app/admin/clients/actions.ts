"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { client } from "@/lib/db/schema";
import { isAdmin } from "@/lib/server-user";

export type ClientInput = {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  notes?: string;
};

type Result = { ok: boolean; id?: string; error?: string };

function values(input: ClientInput) {
  return {
    name: input.name || input.company || "Client",
    company: input.company || null,
    email: input.email || null,
    phone: input.phone || null,
    address: input.address || null,
    taxId: input.taxId || null,
    notes: input.notes || null,
  };
}

export async function createClient(input: ClientInput): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  if (!input.name && !input.company) return { ok: false, error: "Name or company required." };
  const [row] = await db.insert(client).values(values(input)).returning({ id: client.id });
  revalidatePath("/admin/clients");
  return { ok: true, id: row.id };
}

export async function updateClient(id: string, input: ClientInput): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  await db.update(client).set({ ...values(input), updatedAt: new Date() }).where(eq(client.id, id));
  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${id}`);
  return { ok: true };
}

export async function deleteClient(id: string): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  await db.delete(client).where(eq(client.id, id));
  revalidatePath("/admin/clients");
  return { ok: true };
}

export async function bulkDeleteClients(ids: string[]): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  if (!ids || ids.length === 0) return { ok: true };
  await db.delete(client).where(inArray(client.id, ids));
  revalidatePath("/admin/clients");
  return { ok: true };
}

