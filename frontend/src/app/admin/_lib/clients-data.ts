import "server-only";
import { desc, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { client, invoice, serviceRequest } from "@/lib/db/schema";

export type ClientRowLite = {
  id: string;
  name: string;
  contact: string | null;
  email: string | null;
  taxId: string | null;
  openRequests: number;
  billed12m: number;
  owes: number;
  late: number;
  aiMode: string;
  hasPortal: boolean;
  /** ISO time the erasure was scheduled (30-day hold), or null. */
  erasureRequestedAt: string | null;
  lastActivity: string;
  createdAt: string;
};

/** Client directory with the figures the list shows, in one query. */
export async function listClientRows(): Promise<ClientRowLite[]> {
  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({
      c: client,
      open: sql<number>`(SELECT count(*) FROM ${serviceRequest} WHERE ${serviceRequest.clientId} = ${client.id} AND ${serviceRequest.deletedAt} IS NULL AND ${serviceRequest.status} NOT IN ('completed','cancelled','declined','refunded'))`,
      billed: sql<string>`(SELECT coalesce(sum(${invoice.total}),0) FROM ${invoice} WHERE ${invoice.clientId} = ${client.id} AND ${invoice.kind} = 'invoice' AND ${invoice.deletedAt} IS NULL AND ${invoice.status} NOT IN ('draft','void') AND ${invoice.issueDate} >= ${yearAgo})`,
      owes: sql<string>`(SELECT coalesce(sum(${invoice.total} - ${invoice.amountPaid}),0) FROM ${invoice} WHERE ${invoice.clientId} = ${client.id} AND ${invoice.kind} = 'invoice' AND ${invoice.deletedAt} IS NULL AND ${invoice.status} IN ('sent','viewed','overdue','partially_paid'))`,
      late: sql<string>`(SELECT coalesce(sum(${invoice.total} - ${invoice.amountPaid}),0) FROM ${invoice} WHERE ${invoice.clientId} = ${client.id} AND ${invoice.kind} = 'invoice' AND ${invoice.deletedAt} IS NULL AND ${invoice.status} IN ('sent','viewed','overdue','partially_paid') AND ${invoice.dueDate} < ${today})`,
      last: sql<Date>`greatest(${client.updatedAt}, (SELECT max(${serviceRequest.updatedAt}) FROM ${serviceRequest} WHERE ${serviceRequest.clientId} = ${client.id}), (SELECT max(${invoice.updatedAt}) FROM ${invoice} WHERE ${invoice.clientId} = ${client.id}))`,
    })
    .from(client)
    .where(isNull(client.deletedAt))
    .orderBy(desc(client.updatedAt))
    .limit(3000);
  return rows.map(({ c, open, billed, owes, late, last }) => ({
    id: c.id,
    name: c.company || c.name,
    contact: c.company && c.name !== c.company ? c.name : null,
    email: c.email,
    taxId: c.taxId,
    openRequests: Number(open),
    billed12m: Number(billed),
    owes: Math.max(0, Number(owes)),
    late: Math.max(0, Number(late)),
    aiMode: c.aiMode,
    hasPortal: Boolean(c.userId),
    erasureRequestedAt: c.erasureRequestedAt ? c.erasureRequestedAt.toISOString() : null,
    lastActivity: new Date(last ?? c.updatedAt).toISOString(),
    createdAt: c.createdAt.toISOString(),
  }));
}
