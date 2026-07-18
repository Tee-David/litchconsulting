"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { category, post, template } from "@/lib/db/schema";
import { isAdmin } from "@/lib/server-user";

type Result = { ok: boolean; error?: string };
type Kind = "blog" | "template";

/** post.tag for blog, template.category for templates — the free-text column a
 *  rename must cascade into so existing rows keep their (renamed) category. */
function usageColumn(kind: Kind) {
  return kind === "blog" ? post.tag : template.category;
}

async function usageCount(kind: Kind, name: string): Promise<number> {
  const col = usageColumn(kind);
  const table = kind === "blog" ? post : template;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(eq(col, name));
  return row?.n ?? 0;
}

export async function createCategoryAction(kind: Kind, name: string): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Name can't be empty." };
  try {
    const [existing] = await db
      .select({ id: category.id })
      .from(category)
      .where(and(eq(category.kind, kind), eq(category.name, clean)))
      .limit(1);
    if (existing) return { ok: false, error: "That category already exists." };
    await db.insert(category).values({ kind, name: clean });
    revalidatePath("/admin/blog");
    revalidatePath("/admin/finance/templates");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not create category." };
  }
}

export async function renameCategoryAction(id: string, name: string): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Name can't be empty." };
  try {
    const [row] = await db.select().from(category).where(eq(category.id, id)).limit(1);
    if (!row) return { ok: false, error: "Category not found." };
    if (row.name === clean) return { ok: true };

    const kind = row.kind as Kind;
    // Cascade the rename into the content that carries this category as free text.
    await db.update(category).set({ name: clean, updatedAt: new Date() }).where(eq(category.id, id));
    if (kind === "blog") {
      await db.update(post).set({ tag: clean }).where(eq(post.tag, row.name));
    } else {
      await db.update(template).set({ category: clean }).where(eq(template.category, row.name));
    }
    revalidatePath("/admin/blog");
    revalidatePath("/admin/finance/templates");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not rename category." };
  }
}

export async function deleteCategoryAction(id: string): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  try {
    const [row] = await db.select().from(category).where(eq(category.id, id)).limit(1);
    if (!row) return { ok: false, error: "Category not found." };

    const kind = row.kind as Kind;
    const inUse = await usageCount(kind, row.name);
    if (inUse > 0) {
      const noun = kind === "blog" ? "post" : "template";
      return { ok: false, error: `${inUse} ${noun}${inUse === 1 ? "" : "s"} still use this category.` };
    }
    await db.delete(category).where(eq(category.id, id));
    revalidatePath("/admin/blog");
    revalidatePath("/admin/finance/templates");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not delete category." };
  }
}
