import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoice } from "@/lib/db/schema";
import { num } from "@/lib/invoice/money";
import { successfulPaymentsForInvoice } from "@/lib/db/queries/payments";

/**
 * Money entered by hand in Billing goes through the SAME shared paths as
 * Paystack and bank transfers (lib/payments/partial.ts, lib/payments/apply.ts),
 * so deposits start the work, receipts send and clients are told in one place.
 */
export async function applyManualPayment(invoiceId: string, amount: number): Promise<void> {
  const [inv] = await db.select().from(invoice).where(eq(invoice.id, invoiceId)).limit(1);
  if (!inv || inv.status === "paid") return;
  if (num(inv.amountPaid) + amount < num(inv.total) - 0.005) {
    const { applyInvoicePartPaid } = await import("@/lib/payments/partial");
    await applyInvoicePartPaid(inv, amount, { via: "manual" });
  } else {
    const { applyInvoicePaid } = await import("@/lib/payments/apply");
    await applyInvoicePaid(inv, { via: "manual" });
  }
}

/**
 * A correction (a hand-recorded payment removed): re-derive amount_paid from
 * the successful payment rows and put the status back in line. No emails —
 * nothing new happened for the client.
 */
export async function rederivePaid(invoiceId: string): Promise<void> {
  const [inv] = await db.select().from(invoice).where(eq(invoice.id, invoiceId)).limit(1);
  if (!inv) return;
  const paid = (await successfulPaymentsForInvoice(invoiceId)).reduce((s, p) => s + num(p.amountSettled ?? p.amount), 0);
  const total = num(inv.total);
  const status = paid >= total - 0.005 && total > 0 ? "paid" : paid > 0.005 ? "partially_paid" : ["paid", "partially_paid"].includes(inv.status) ? "sent" : inv.status;
  await db
    .update(invoice)
    .set({ amountPaid: paid.toFixed(2), status, paidAt: status === "paid" ? inv.paidAt ?? new Date() : null, updatedAt: new Date() })
    .where(eq(invoice.id, invoiceId));
}
