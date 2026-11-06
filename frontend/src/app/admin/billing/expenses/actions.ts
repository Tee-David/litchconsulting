"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { expense } from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit";
import { EXPENSE_CATEGORIES, RECEIPT_PREFIX } from "@/lib/accounting/categories";
import { actor, DENIED, failure } from "../../_lib/guard";

type ActionResult = { ok: boolean; id?: string; error?: string };

export type ExpenseInput = {
  id?: string;
  date: string;
  category: string;
  vendor?: string;
  description?: string;
  amount: number | string;
  vatInput?: number | string;
  whtDeducted?: number | string;
  currency?: string;
  method?: string;
  reference?: string;
};

const CATS = new Set<string>(EXPENSE_CATEGORIES.map((c) => c.key));
const uuid = z.string().uuid();

function touch() {
  revalidatePath("/admin/billing/expenses");
  revalidatePath("/admin");
}

/** Optional money field: blank → 0; otherwise a finite number ≥ 0. */
function money(v: number | string | undefined): number | null {
  if (v === undefined || v === null || String(v).trim() === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Create or update an expense entry. VAT and WHT can never exceed the amount. */
export async function saveExpenseAction(input: ExpenseInput): Promise<ActionResult> {
  const me = await actor("billing");
  if (!me) return DENIED;
  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Pick the date of the expense." };
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter the amount paid." };
  const vat = money(input.vatInput);
  const wht = money(input.whtDeducted);
  if (vat === null || wht === null) return { ok: false, error: "VAT and WHT must be blank or a number of 0 or more." };
  if (vat > amount) return { ok: false, error: "The VAT input cannot be more than the amount." };
  if (wht > amount) return { ok: false, error: "The WHT deducted cannot be more than the amount." };

  const fields = {
    date: input.date,
    category: CATS.has(input.category) ? input.category : "other",
    vendor: input.vendor?.trim() || null,
    description: input.description?.trim() || null,
    amount: amount.toFixed(2),
    vatInput: vat.toFixed(2),
    whtDeducted: wht.toFixed(2),
    currency: input.currency || "NGN",
    method: input.method || null,
    reference: input.reference?.trim() || null,
    updatedAt: new Date(),
  };

  try {
    let id = input.id;
    if (id) {
      if (!uuid.safeParse(id).success) return { ok: false, error: "Expense not found." };
      await db.update(expense).set(fields).where(eq(expense.id, id));
    } else {
      const [row] = await db.insert(expense).values({ ...fields, createdByUserId: me.id }).returning({ id: expense.id });
      id = row.id;
    }
    touch();
    return { ok: true, id };
  } catch (err) {
    return failure(err, "The expense was not saved. Try again.");
  }
}

/** Attach an uploaded receipt (key from /api/admin/expenses/receipt) to its expense. */
export async function attachReceiptAction(id: string, key: string, name: string): Promise<ActionResult> {
  const me = await actor("billing");
  if (!me) return DENIED;
  if (!uuid.safeParse(id).success || !key.startsWith(RECEIPT_PREFIX(id))) return { ok: false, error: "That upload does not belong to this expense." };
  const [old] = await db.select({ key: expense.receiptKey }).from(expense).where(eq(expense.id, id)).limit(1);
  if (!old) return { ok: false, error: "Expense not found." };
  await db.update(expense).set({ receiptKey: key, receiptName: name.slice(0, 200) || "receipt", receiptScanStatus: "unscanned", updatedAt: new Date() }).where(eq(expense.id, id));
  if (old.key && old.key !== key) {
    const { deletePrivateObject } = await import("@/lib/r2");
    await deletePrivateObject(old.key).catch(() => null);
  }
  touch();
  return { ok: true, id };
}

/** Short-lived link to open a receipt, after the virus check. */
export async function receiptUrlAction(id: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!(await actor("billing"))) return DENIED;
  if (!uuid.safeParse(id).success) return { ok: false, error: "Expense not found." };
  const [e] = await db.select().from(expense).where(eq(expense.id, id)).limit(1);
  if (!e?.receiptKey) return { ok: false, error: "This expense has no receipt." };
  const { ensureReceiptScanned, downloadBlock } = await import("@/lib/uploads/scan");
  const blocked = downloadBlock(await ensureReceiptScanned({ id: e.id, receiptKey: e.receiptKey, receiptName: e.receiptName, receiptScanStatus: e.receiptScanStatus }), "firm");
  if (blocked) return { ok: false, error: blocked };
  try {
    const { presignPrivateGet } = await import("@/lib/r2");
    return { ok: true, url: await presignPrivateGet(e.receiptKey, { downloadName: e.receiptName || "receipt", expiresIn: 300 }) };
  } catch {
    return { ok: false, error: "File storage is not reachable, so the receipt cannot be opened right now." };
  }
}

/** Remove a receipt from an expense (the file is deleted from storage). */
export async function removeReceiptAction(id: string): Promise<ActionResult> {
  if (!(await actor("billing"))) return DENIED;
  if (!uuid.safeParse(id).success) return { ok: false, error: "Expense not found." };
  const [e] = await db.select({ key: expense.receiptKey }).from(expense).where(eq(expense.id, id)).limit(1);
  if (!e?.key) return { ok: true, id };
  await db.update(expense).set({ receiptKey: null, receiptName: null, receiptScanStatus: "unscanned", updatedAt: new Date() }).where(eq(expense.id, id));
  const { deletePrivateObject } = await import("@/lib/r2");
  await deletePrivateObject(e.key).catch(() => null);
  touch();
  return { ok: true, id };
}

/** Bulk: move expenses to another category. */
export async function bulkCategoryAction(ids: string[], category: string): Promise<ActionResult> {
  if (!(await actor("billing"))) return DENIED;
  const parsed = z.array(uuid).min(1).max(500).safeParse(ids);
  if (!parsed.success || !CATS.has(category)) return { ok: false, error: "Select expenses and a category." };
  await db.update(expense).set({ category, updatedAt: new Date() }).where(inArray(expense.id, parsed.data));
  touch();
  return { ok: true };
}

export async function deleteExpenseAction(id: string): Promise<ActionResult> {
  return bulkDeleteExpensesAction([id]);
}

/** Delete expenses for good (their receipts too). Audit-logged. */
export async function bulkDeleteExpensesAction(ids: string[]): Promise<ActionResult> {
  if (!(await actor("billing"))) return DENIED;
  const parsed = z.array(uuid).min(1).max(500).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Select up to 500 expenses." };
  try {
    const gone = await db.delete(expense).where(inArray(expense.id, parsed.data)).returning({ id: expense.id, vendor: expense.vendor, amount: expense.amount, key: expense.receiptKey });
    const keys = gone.map((g) => g.key).filter((k): k is string => Boolean(k));
    if (keys.length) {
      const { deletePrivateObject } = await import("@/lib/r2");
      await Promise.all(keys.map((k) => deletePrivateObject(k).catch(() => null)));
    }
    await recordAudit({ action: "expense.deleted", entity: "expense", meta: { count: gone.length, vendors: gone.map((g) => g.vendor).filter(Boolean).slice(0, 20) } });
    touch();
    return { ok: true };
  } catch (err) {
    return failure(err, "The expenses were not deleted. Try again.");
  }
}
