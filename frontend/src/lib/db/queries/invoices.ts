import "server-only";
import { desc, eq, like, and, ne, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoice, invoiceItem } from "@/lib/db/schema";
import { num } from "@/lib/invoice/money";

export type InvoiceRow = typeof invoice.$inferSelect;
export type InvoiceItemRow = typeof invoiceItem.$inferSelect;

/** Invoices (kind='invoice'), newest first. */
export async function listInvoices(): Promise<InvoiceRow[]> {
  return db.select().from(invoice).where(eq(invoice.kind, "invoice")).orderBy(desc(invoice.createdAt));
}

/** Quotes (kind='quote'), newest first. */
export async function listQuotes(): Promise<InvoiceRow[]> {
  return db.select().from(invoice).where(eq(invoice.kind, "quote")).orderBy(desc(invoice.createdAt));
}

/** One invoice with its line items (ordered), or null. */
export async function getInvoice(id: string) {
  const [inv] = await db.select().from(invoice).where(eq(invoice.id, id)).limit(1);
  if (!inv) return null;
  const items = await db
    .select()
    .from(invoiceItem)
    .where(eq(invoiceItem.invoiceId, id))
    .orderBy(invoiceItem.position);
  return { invoice: inv, items };
}

/** Public invoice by share token (read-only pay page). */
export async function getInvoiceByToken(token: string) {
  const [inv] = await db.select().from(invoice).where(eq(invoice.publicToken, token)).limit(1);
  if (!inv) return null;
  const items = await db
    .select()
    .from(invoiceItem)
    .where(eq(invoiceItem.invoiceId, inv.id))
    .orderBy(invoiceItem.position);
  return { invoice: inv, items };
}

/** KPI aggregates for the dashboard / list header (invoices only). */
export async function invoiceStats() {
  const rows = await db
    .select({ status: invoice.status, total: invoice.total, amountPaid: invoice.amountPaid })
    .from(invoice)
    .where(eq(invoice.kind, "invoice"));
  let invoiced = 0,
    paid = 0,
    outstanding = 0,
    overdueCount = 0,
    draftCount = 0;
  for (const r of rows) {
    const total = num(r.total);
    invoiced += total;
    if (r.status === "paid") paid += total;
    if (r.status === "sent" || r.status === "overdue") outstanding += total - num(r.amountPaid);
    if (r.status === "overdue") overdueCount++;
    if (r.status === "draft") draftCount++;
  }
  return { invoiced, paid, outstanding, overdueCount, draftCount, count: rows.length };
}

/** Next sequential number for the current year: INV-YYYY-NNN or QUO-YYYY-NNN. */
export async function nextInvoiceNumber(kind: "invoice" | "quote" = "invoice"): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${kind === "quote" ? "QUO" : "INV"}-${year}-`;
  const rows = await db
    .select({ number: invoice.number })
    .from(invoice)
    .where(like(invoice.number, `${prefix}%`));
  let max = 0;
  for (const r of rows) {
    const n = parseInt(r.number.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

/** Recent invoices feed helper (dashboard). */
export async function recentInvoices(limit = 5): Promise<InvoiceRow[]> {
  return db
    .select()
    .from(invoice)
    .where(eq(invoice.kind, "invoice"))
    .orderBy(desc(invoice.createdAt))
    .limit(limit);
}

/**
 * Invoices and quotes for a specific client. Drafts are admin-only work in
 * progress — clients only ever see documents that have been sent or later, and
 * never soft-deleted rows.
 */
export async function listClientInvoices(clientId: string): Promise<InvoiceRow[]> {
  return db
    .select()
    .from(invoice)
    .where(
      and(
        eq(invoice.clientId, clientId),
        isNull(invoice.deletedAt),
        ne(invoice.status, "draft"),
      ),
    )
    .orderBy(desc(invoice.createdAt));
}

/** Get a client's invoice or quote by ID, with line items (never drafts). */
export async function getClientInvoice(id: string, clientId: string) {
  const [inv] = await db
    .select()
    .from(invoice)
    .where(
      and(
        eq(invoice.id, id),
        eq(invoice.clientId, clientId),
        isNull(invoice.deletedAt),
        ne(invoice.status, "draft"),
      ),
    )
    .limit(1);
  if (!inv) return null;
  const items = await db
    .select()
    .from(invoiceItem)
    .where(eq(invoiceItem.invoiceId, id))
    .orderBy(invoiceItem.position);
  return { invoice: inv, items };
}

/** KPI aggregates for a client's dashboard. */
export async function clientInvoiceStats(clientId: string) {
  const rows = await db
    .select({ status: invoice.status, total: invoice.total, amountPaid: invoice.amountPaid })
    .from(invoice)
    .where(and(eq(invoice.clientId, clientId), eq(invoice.kind, "invoice")));
  let invoiced = 0,
    paid = 0,
    outstanding = 0,
    overdueCount = 0,
    draftCount = 0;
  for (const r of rows) {
    const total = num(r.total);
    invoiced += total;
    if (r.status === "paid") paid += total;
    if (r.status === "sent" || r.status === "overdue") outstanding += total - num(r.amountPaid);
    if (r.status === "overdue") overdueCount++;
    if (r.status === "draft") draftCount++;
  }
  return { invoiced, paid, outstanding, overdueCount, draftCount, count: rows.length };
}
