import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clientNote, type ClientNote } from "@/lib/db/schema";

/** Open tasks first (earliest due first), then done tasks, then notes (newest first). */
export async function listClientNotes(clientId: string): Promise<ClientNote[]> {
  const rows = await db
    .select()
    .from(clientNote)
    .where(eq(clientNote.clientId, clientId))
    .orderBy(desc(clientNote.createdAt), asc(clientNote.id));
  const openTasks = rows
    .filter((n) => n.kind === "task" && !n.done)
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const doneTasks = rows.filter((n) => n.kind === "task" && n.done);
  const notes = rows.filter((n) => n.kind !== "task");
  return [...openTasks, ...doneTasks, ...notes];
}
