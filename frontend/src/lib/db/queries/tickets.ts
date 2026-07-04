import "server-only";
import { asc, desc, eq, like, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { ticket, ticketMessage } from "@/lib/db/schema";

export type TicketRow = typeof ticket.$inferSelect;
export type TicketMessageRow = typeof ticketMessage.$inferSelect;

/** All tickets, most recently active first. */
export async function listTickets(): Promise<TicketRow[]> {
  return db
    .select()
    .from(ticket)
    .orderBy(desc(ticket.lastReplyAt), desc(ticket.createdAt));
}

/** All ticket messages (thread bodies), oldest first — grouped client-side. */
export async function listAllMessages(): Promise<TicketMessageRow[]> {
  return db.select().from(ticketMessage).orderBy(asc(ticketMessage.createdAt));
}

export async function getTicket(id: string) {
  const [t] = await db.select().from(ticket).where(eq(ticket.id, id)).limit(1);
  if (!t) return null;
  const messages = await db
    .select()
    .from(ticketMessage)
    .where(eq(ticketMessage.ticketId, id))
    .orderBy(asc(ticketMessage.createdAt));
  return { ticket: t, messages };
}

/** Next TKT-NNNN sequence. */
export async function nextTicketNumber(): Promise<string> {
  const rows = await db.select({ number: ticket.number }).from(ticket).where(like(ticket.number, "TKT-%"));
  let max = 1000;
  for (const r of rows) {
    const n = parseInt(r.number.slice(4), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `TKT-${max + 1}`;
}

/** All tickets for a specific client, most recently active first. */
export async function listClientTickets(clientId: string): Promise<TicketRow[]> {
  return db
    .select()
    .from(ticket)
    .where(eq(ticket.clientId, clientId))
    .orderBy(desc(ticket.lastReplyAt), desc(ticket.createdAt));
}

/** Get a ticket details and thread for a client, validating ownership. */
export async function getClientTicket(id: string, clientId: string) {
  const [t] = await db
    .select()
    .from(ticket)
    .where(and(eq(ticket.id, id), eq(ticket.clientId, clientId)))
    .limit(1);
  if (!t) return null;
  const messages = await db
    .select()
    .from(ticketMessage)
    .where(eq(ticketMessage.ticketId, id))
    .orderBy(asc(ticketMessage.createdAt));
  return { ticket: t, messages };
}
