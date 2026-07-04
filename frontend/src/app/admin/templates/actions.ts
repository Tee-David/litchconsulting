"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { template } from "@/lib/db/schema";
import { isAdmin, getCurrentUserId } from "@/lib/server-user";
import { deleteObject, keyFromUrl } from "@/lib/r2";

type ActionResult = { ok: boolean; id?: string; error?: string };

export type TemplateInput = {
  title: string;
  description?: string;
  category?: string;
  fileType: string;
  fileUrl: string;
  fileKey?: string;
  sizeBytes?: number;
  badge?: string;
};

async function requireAdmin(): Promise<string | null> {
  if (!(await isAdmin())) return null;
  return getCurrentUserId();
}

/** Persist metadata for a file already uploaded to R2 (via the presign route). */
export async function saveTemplateAction(input: TemplateInput): Promise<ActionResult> {
  const uid = await requireAdmin();
  if (!uid) return { ok: false, error: "Unauthorized" };
  if (!input.title.trim()) return { ok: false, error: "A title is required." };
  if (!input.fileUrl) return { ok: false, error: "Upload a file first." };

  const [row] = await db
    .insert(template)
    .values({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      category: input.category?.trim() || "General",
      fileType: (input.fileType || "PDF").toUpperCase(),
      fileUrl: input.fileUrl,
      fileKey: input.fileKey || keyFromUrl(input.fileUrl) || null,
      sizeBytes: Math.max(0, Math.round(input.sizeBytes || 0)),
      badge: input.badge || null,
      uploadedByUserId: uid,
    })
    .returning({ id: template.id });

  revalidatePath("/admin/templates");
  return { ok: true, id: row.id };
}

export async function deleteTemplateAction(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  const [row] = await db.select().from(template).where(eq(template.id, id)).limit(1);
  await db.delete(template).where(eq(template.id, id));
  // Best-effort R2 cleanup.
  const key = row?.fileKey || (row?.fileUrl ? keyFromUrl(row.fileUrl) : null);
  if (key) {
    try {
      await deleteObject(key);
    } catch {
      /* ignore storage cleanup failures */
    }
  }
  revalidatePath("/admin/templates");
  return { ok: true };
}
