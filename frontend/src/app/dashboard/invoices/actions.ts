"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoice } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/server-user";
import { getClientForUser } from "@/lib/db/queries/clients";

type ActionResult = { ok: boolean; error?: string };

async function verifyClientQuote(quoteId: string) {
  const user = await getSessionUser();
  if (!user || user.role !== "client") return { error: "Unauthorized" };

  const clientRow = await getClientForUser(user.id, user.email, user.name);

  const [q] = await db
    .select()
    .from(invoice)
    .where(and(eq(invoice.id, quoteId), eq(invoice.clientId, clientRow.id), eq(invoice.kind, "quote")))
    .limit(1);

  if (!q) return { error: "Quote not found." };
  return { ok: true, clientRow, quote: q };
}

export async function acceptQuoteAction(id: string): Promise<ActionResult> {
  const check = await verifyClientQuote(id);
  if (check.error) return { ok: false, error: check.error };

  await db
    .update(invoice)
    .set({ status: "accepted", updatedAt: new Date() })
    .where(eq(invoice.id, id));

  revalidatePath("/dashboard/invoices");
  revalidatePath(`/dashboard/invoices/${id}`);
  revalidatePath("/admin/finance/quotes");
  return { ok: true };
}

export async function declineQuoteAction(id: string): Promise<ActionResult> {
  const check = await verifyClientQuote(id);
  if (check.error) return { ok: false, error: check.error };

  await db
    .update(invoice)
    .set({ status: "declined", updatedAt: new Date() })
    .where(eq(invoice.id, id));

  revalidatePath("/dashboard/invoices");
  revalidatePath(`/dashboard/invoices/${id}`);
  revalidatePath("/admin/finance/quotes");
  return { ok: true };
}
