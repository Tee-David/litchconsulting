import "server-only";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { template } from "@/lib/db/schema";

export type TemplateRow = typeof template.$inferSelect;

/** Imported templates, newest first. Tolerant of a not-yet-migrated table. */
export async function listTemplates(): Promise<TemplateRow[]> {
  try {
    return await db.select().from(template).orderBy(desc(template.createdAt));
  } catch {
    return [];
  }
}
