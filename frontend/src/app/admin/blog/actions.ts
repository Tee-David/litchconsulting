"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { post } from "@/lib/db/schema";
import { isAdmin, getCurrentUserId } from "@/lib/server-user";
import { slugTaken } from "@/lib/db/queries/posts";
import { estimateReadMins, slugify } from "@/lib/insights-format";
import type { PostInput } from "@/lib/blog-types";

type ActionResult = { ok: boolean; id?: string; slug?: string; error?: string };

async function requireAdmin(): Promise<string | null> {
  if (!(await isAdmin())) return null;
  return getCurrentUserId();
}

function revalidateBlog(slug?: string) {
  revalidatePath("/admin/blog");
  revalidatePath("/insights");
  if (slug) revalidatePath(`/insights/${slug}`);
}

/** Create or update a post. */
export async function savePostAction(input: PostInput): Promise<ActionResult> {
  const uid = await requireAdmin();
  if (!uid) return { ok: false, error: "Unauthorized" };
  if (!input.title.trim()) return { ok: false, error: "A title is required." };

  const slug = slugify(input.slug || input.title);
  if (!slug) return { ok: false, error: "Could not derive a URL slug from the title." };
  if (await slugTaken(slug, input.id)) return { ok: false, error: `The slug “${slug}” is already in use.` };

  const status = input.status === "published" ? "published" : "draft";
  const fields = {
    slug,
    title: input.title.trim(),
    tag: input.tag?.trim() || "Insights",
    excerpt: input.excerpt?.trim() || null,
    coverImage: input.coverImage?.trim() || null,
    author: input.author?.trim() || "Litch Consulting",
    body: input.body || "",
    status,
    seoTitle: input.seoTitle?.trim() || null,
    seoDescription: input.seoDescription?.trim() || null,
    readMins: estimateReadMins(input.body),
    updatedAt: new Date(),
  };

  let id = input.id;
  if (id) {
    // Set publishedAt the first time it goes live.
    const existing = await db.select({ publishedAt: post.publishedAt }).from(post).where(eq(post.id, id)).limit(1);
    const publishedAt =
      status === "published" ? existing[0]?.publishedAt ?? new Date() : null;
    await db.update(post).set({ ...fields, publishedAt }).where(eq(post.id, id));
  } else {
    const [row] = await db
      .insert(post)
      .values({ ...fields, publishedAt: status === "published" ? new Date() : null, createdByUserId: uid })
      .returning({ id: post.id });
    id = row.id;
  }

  revalidateBlog(slug);
  return { ok: true, id, slug };
}

export async function setPostStatusAction(id: string, status: "draft" | "published"): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  const [row] = await db.select().from(post).where(eq(post.id, id)).limit(1);
  if (!row) return { ok: false, error: "Not found" };
  const publishedAt = status === "published" ? row.publishedAt ?? new Date() : null;
  await db.update(post).set({ status, publishedAt, updatedAt: new Date() }).where(eq(post.id, id));
  revalidateBlog(row.slug);
  return { ok: true, slug: row.slug };
}

export async function deletePostAction(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  const [row] = await db.select({ slug: post.slug }).from(post).where(eq(post.id, id)).limit(1);
  await db.delete(post).where(eq(post.id, id));
  revalidateBlog(row?.slug);
  return { ok: true };
}

/* -------------------------------------------------------------------------- *
 * Bulk actions — for the box-select toolbar on the blog table.
 * -------------------------------------------------------------------------- */

export async function bulkSetPostStatusAction(
  ids: string[],
  status: "draft" | "published",
): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  if (ids.length === 0) return { ok: false, error: "Nothing selected." };
  // Mirror savePostAction's publish semantics per row: set publishedAt on first
  // publish (keep an existing one), clear it on unpublish — so the public page
  // sorts correctly instead of showing bulk-published posts with a null date.
  const rows = await db
    .select({ id: post.id, publishedAt: post.publishedAt })
    .from(post)
    .where(inArray(post.id, ids));
  for (const row of rows) {
    const publishedAt = status === "published" ? row.publishedAt ?? new Date() : null;
    await db.update(post).set({ status, publishedAt, updatedAt: new Date() }).where(eq(post.id, row.id));
  }
  revalidateBlog();
  return { ok: true };
}

export async function bulkDeletePostsAction(ids: string[]): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  if (ids.length === 0) return { ok: false, error: "Nothing selected." };
  await db.delete(post).where(inArray(post.id, ids));
  revalidateBlog();
  return { ok: true };
}
