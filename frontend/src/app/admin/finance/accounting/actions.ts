"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { expense } from "@/lib/db/schema";
import { isAdmin, getCurrentUserId } from "@/lib/server-user";

type ActionResult = { ok: boolean; id?: string; error?: string };

export type ExpenseInput = {
  id?: string;
  date: string;
  category: string;
  vendor?: string;
  description?: string;
  amount: number | string;
  currency?: string;
  method?: string;
  reference?: string;
};

async function requireAdmin(): Promise<string | null> {
  if (!(await isAdmin())) return null;
  return getCurrentUserId();
}

/** Create or update an expense entry. */
export async function saveExpenseAction(input: ExpenseInput): Promise<ActionResult> {
  const uid = await requireAdmin();
  if (!uid) return { ok: false, error: "Unauthorized" };
  if (!input.date) return { ok: false, error: "Date is required." };
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter a valid amount." };

  const fields = {
    date: input.date,
    category: input.category || "other",
    vendor: input.vendor?.trim() || null,
    description: input.description?.trim() || null,
    amount: amount.toFixed(2),
    currency: input.currency || "NGN",
    method: input.method || null,
    reference: input.reference?.trim() || null,
    updatedAt: new Date(),
  };

  let id = input.id;
  if (id) {
    await db.update(expense).set(fields).where(eq(expense.id, id));
  } else {
    const [row] = await db.insert(expense).values({ ...fields, createdByUserId: uid }).returning({ id: expense.id });
    id = row.id;
  }
  revalidatePath("/admin/finance/accounting");
  revalidatePath("/admin");
  return { ok: true, id };
}

export async function deleteExpenseAction(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  await db.delete(expense).where(eq(expense.id, id));
  revalidatePath("/admin/finance/accounting");
  return { ok: true };
}
