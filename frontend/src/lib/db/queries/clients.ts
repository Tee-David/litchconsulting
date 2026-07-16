import "server-only";
import { and, desc, eq, isNull, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { client } from "@/lib/db/schema";

export type ClientRow = typeof client.$inferSelect;

/** Live clients only (Trash excluded). */
export async function listClients(): Promise<ClientRow[]> {
  return db
    .select()
    .from(client)
    .where(isNull(client.deletedAt))
    .orderBy(desc(client.createdAt));
}

/** Soft-deleted clients (the Trash view). */
export async function listTrashedClients(): Promise<ClientRow[]> {
  return db
    .select()
    .from(client)
    .where(isNotNull(client.deletedAt))
    .orderBy(desc(client.deletedAt));
}

export async function getClient(id: string): Promise<ClientRow | null> {
  const [c] = await db.select().from(client).where(eq(client.id, id)).limit(1);
  return c ?? null;
}

export async function getClientForUser(userId: string, email: string, name?: string): Promise<ClientRow> {
  // 1. Try to find by userId
  let [c] = await db.select().from(client).where(eq(client.userId, userId)).limit(1);
  if (c) return c;

  // 2. Try to find by email
  if (email) {
    [c] = await db.select().from(client).where(eq(client.email, email)).limit(1);
    if (c) {
      // Link the client to the user
      await db.update(client).set({ userId, updatedAt: new Date() }).where(eq(client.id, c.id));
      c.userId = userId;
      return c;
    }
  }

  // 3. Create a new client record
  const [newClient] = await db
    .insert(client)
    .values({
      userId,
      name: name || "Client",
      email: email || null,
    })
    .returning();
  return newClient;
}

/** Other client rows sharing this email (drives the hub's merge affordance). */
export async function findDuplicateClients(
  email: string | null | undefined,
  excludeId: string
): Promise<ClientRow[]> {
  if (!email) return [];
  return db
    .select()
    .from(client)
    .where(
      and(
        sql`lower(${client.email}) = ${email.toLowerCase()}`,
        ne(client.id, excludeId),
        isNull(client.deletedAt)
      )
    )
    .orderBy(desc(client.createdAt));
}

