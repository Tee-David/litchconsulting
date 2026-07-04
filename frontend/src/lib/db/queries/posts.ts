import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { post } from "@/lib/db/schema";

export type PostRow = typeof post.$inferSelect;

/** All posts (admin), newest first. */
export async function listPosts(): Promise<PostRow[]> {
  return db.select().from(post).orderBy(desc(post.createdAt));
}

/** Published posts only, newest published first. Tolerant of DB errors. */
export async function listPublishedPosts(): Promise<PostRow[]> {
  try {
    return await db
      .select()
      .from(post)
      .where(eq(post.status, "published"))
      .orderBy(desc(post.publishedAt), desc(post.createdAt));
  } catch {
    return [];
  }
}

export async function getPost(id: string): Promise<PostRow | null> {
  const [row] = await db.select().from(post).where(eq(post.id, id)).limit(1);
  return row ?? null;
}

/** True if a slug is taken by a different post. */
export async function slugTaken(slug: string, exceptId?: string): Promise<boolean> {
  const rows = await db.select({ id: post.id }).from(post).where(eq(post.slug, slug)).limit(1);
  const found = rows[0];
  return !!found && found.id !== exceptId;
}
