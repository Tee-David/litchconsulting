import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { client } from "@/lib/db/schema";

export type ClientRow = typeof client.$inferSelect;

export async function listClients(): Promise<ClientRow[]> {
  return db.select().from(client).orderBy(desc(client.createdAt));
}

export async function getClient(id: string): Promise<ClientRow | null> {
  const [c] = await db.select().from(client).where(eq(client.id, id)).limit(1);
  return c ?? null;
}
