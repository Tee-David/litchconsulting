import "server-only";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { expense } from "@/lib/db/schema";

export type ExpenseRow = typeof expense.$inferSelect;

/** All expenses, newest first. */
export async function listExpenses(): Promise<ExpenseRow[]> {
  return db.select().from(expense).orderBy(desc(expense.date), desc(expense.createdAt));
}
