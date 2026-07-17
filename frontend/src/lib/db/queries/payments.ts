import "server-only";
import { desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { payment, invoice, client } from "@/lib/db/schema";

export type PaymentRow = {
  payment: typeof payment.$inferSelect;
  invoiceNumber: string | null;
  invoiceId: string;
  clientName: string | null;
  clientCompany: string | null;
};

/**
 * Every payment attempt that got past initialisation, newest first.
 *
 * Joined out to the invoice and client so the ledger is searchable **by name**
 * — a `payment` row on its own only carries ids and a `LC-…` reference, which
 * is the one thing you don't have to hand when a client rings up about money
 * they've sent. `initialized` rows are excluded: they're checkout sessions
 * nobody completed, not payments (the daily sweep abandons them after 24h).
 *
 * LEFT JOIN on client because `payment.client_id` is a soft ref and is null on
 * older rows — a payment must never vanish from the ledger for want of a name.
 */
export async function listPayments(): Promise<PaymentRow[]> {
  const rows = await db
    .select({
      payment,
      invoiceNumber: invoice.number,
      billToName: invoice.billToName,
      billToCompany: invoice.billToCompany,
      clientName: client.name,
      clientCompany: client.company,
    })
    .from(payment)
    .innerJoin(invoice, eq(payment.invoiceId, invoice.id))
    .leftJoin(client, eq(payment.clientId, client.id))
    .where(ne(payment.status, "initialized"))
    .orderBy(desc(payment.updatedAt));

  return rows.map((r) => ({
    payment: r.payment,
    invoiceNumber: r.invoiceNumber,
    invoiceId: r.payment.invoiceId,
    // The invoice's bill-to is the name that was actually billed; fall back to
    // the client record when the invoice was raised without one.
    clientName: r.billToName || r.clientName,
    clientCompany: r.billToCompany || r.clientCompany,
  }));
}
