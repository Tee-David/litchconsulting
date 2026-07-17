import "server-only";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sageConversation, sageMessage, type SageConversation, type SageMessage } from "@/lib/db/schema";

/** Recent conversations for one user, newest first. Optional title/content search.
 *  Tolerant of a not-yet-migrated table — an admin sees "no history" instead of a 500. */
export async function listSageConversations(
  userId: string,
  opts?: { search?: string; limit?: number }
): Promise<SageConversation[]> {
  try {
    const q = opts?.search?.trim();
    if (!q) {
      return await db
        .select()
        .from(sageConversation)
        .where(eq(sageConversation.userId, userId))
        .orderBy(desc(sageConversation.updatedAt))
        .limit(opts?.limit ?? 50);
    }
    // Title match, or match against any message body in the thread.
    const byTitle = db
      .select({ id: sageConversation.id })
      .from(sageConversation)
      .where(and(eq(sageConversation.userId, userId), ilike(sageConversation.title, `%${q}%`)));
    const byBody = db
      .select({ id: sageMessage.conversationId })
      .from(sageMessage)
      .innerJoin(sageConversation, eq(sageMessage.conversationId, sageConversation.id))
      .where(and(eq(sageConversation.userId, userId), ilike(sageMessage.content, `%${q}%`)));
    const [titleRows, bodyRows] = await Promise.all([byTitle, byBody]);
    const ids = Array.from(new Set([...titleRows.map((r) => r.id), ...bodyRows.map((r) => r.id)]));
    if (ids.length === 0) return [];
    return await db
      .select()
      .from(sageConversation)
      .where(and(eq(sageConversation.userId, userId), or(...ids.map((id) => eq(sageConversation.id, id)))))
      .orderBy(desc(sageConversation.updatedAt))
      .limit(opts?.limit ?? 50);
  } catch {
    return [];
  }
}

/** All messages in one conversation, oldest first — the thread to replay into the UI. */
export async function getSageMessages(conversationId: string): Promise<SageMessage[]> {
  try {
    return await db
      .select()
      .from(sageMessage)
      .where(eq(sageMessage.conversationId, conversationId))
      .orderBy(asc(sageMessage.createdAt));
  } catch {
    return [];
  }
}

/** Ownership-checked single conversation fetch. */
export async function getSageConversation(
  id: string,
  userId: string
): Promise<SageConversation | null> {
  try {
    const [row] = await db
      .select()
      .from(sageConversation)
      .where(and(eq(sageConversation.id, id), eq(sageConversation.userId, userId)))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}
