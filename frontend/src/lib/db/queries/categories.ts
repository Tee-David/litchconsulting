import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { category, type Category } from "@/lib/db/schema";

/** Managed categories for a surface ('blog' | 'template'), ordered for display.
 *  Tolerant of a not-yet-migrated table so pages render an empty pick-list
 *  instead of 500-ing. */
export async function listCategories(kind: string): Promise<Category[]> {
  try {
    return await db
      .select()
      .from(category)
      .where(eq(category.kind, kind))
      .orderBy(asc(category.sortOrder), asc(category.name));
  } catch {
    return [];
  }
}

/** Just the names — for a `<select>` / pill list. */
export async function listCategoryNames(kind: string): Promise<string[]> {
  return (await listCategories(kind)).map((c) => c.name);
}

export async function categoryExists(kind: string, name: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ id: category.id })
      .from(category)
      .where(and(eq(category.kind, kind), eq(category.name, name)))
      .limit(1);
    return Boolean(row);
  } catch {
    return false;
  }
}
