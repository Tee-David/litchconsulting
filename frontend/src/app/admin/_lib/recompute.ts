import "server-only";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoice, serviceRequest, serviceRequestEvent, type Invoice } from "@/lib/db/schema";
import { num } from "@/lib/invoice/money";
import { successfulPaymentsForInvoice } from "@/lib/db/queries/payments";

/** Amount due now on a deposit invoice (percent of the job total). */
export function depositDue(inv: { total: string; depositPercent: number | null }): number {
  const pct = Math.min(100, Math.max(1, inv.depositPercent ?? 100));
  return Math.round(num(inv.total) * pct) / 100;
}

/** Deposit landed → move the linked request out of pending_payment (once). */
async function advanceRequestAfterDeposit(inv: Invoice): Promise<void> {
  const [req] = await db.select().from(serviceRequest).where(eq(serviceRequest.invoiceId, inv.id)).limit(1);
  if (!req || req.status !== "pending_payment") return;
  const docs = (req.requiredDocuments as Array<{ required?: boolean }>) ?? [];
  const toStatus = docs.some((d) => d.required) ? "awaiting_documents" : "in_progress";
  const now = new Date();
  const moved = await db
    .update(serviceRequest)
    .set({ status: toStatus, updatedAt: now })
    .where(and(eq(serviceRequest.id, req.id), eq(serviceRequest.status, "pending_payment")))
    .returning({ id: serviceRequest.id });
  if (!moved[0]) return;
  await db.insert(serviceRequestEvent).values([
    { requestId: req.id, type: "payment_received", message: `Deposit received for invoice ${inv.number}.`, visibility: "client", actorRole: "system" },
    {
      requestId: req.id,
      type: "status_changed",
      fromStatus: "pending_payment",
      toStatus,
      message: toStatus === "awaiting_documents" ? "Next step: upload your documents so we can get started." : "Work has started on your request.",
      visibility: "client",
      actorRole: "system",
    },
  ]);
  revalidatePath(`/admin/requests/${req.id}`);
  revalidatePath(`/dashboard/requests/${req.id}`);
}

/**
 * Re-derive `amount_paid` from successful payments (never trust a typed
 * total). Paid in full → applyInvoicePaid runs the shared side effects
 * (receipt, request advance, audit) exactly as an online payment does; a
 * balance invoice paid in full also closes its deposit invoice. Money in but
 * not all of it → partially_paid, and a deposit invoice whose deposit is in
 * moves its request on. All money removed → back to sent.
 */
export async function recomputeInvoicePaid(invoiceId: string): Promise<void> {
  const [inv] = await db.select().from(invoice).where(eq(invoice.id, invoiceId)).limit(1);
  if (!inv) return;

  const paid = (await successfulPaymentsForInvoice(invoiceId)).reduce((sum, p) => sum + num(p.amountSettled ?? p.amount), 0);
  const total = num(inv.total);
  const cleared = total > 0 && paid >= total;

  if (cleared && inv.status !== "paid") {
    const { applyInvoicePaid } = await import("@/lib/payments/apply");
    await applyInvoicePaid(inv, { via: "manual" });
    if (inv.parentInvoiceId) {
      await db
        .update(invoice)
        .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
        .where(and(eq(invoice.id, inv.parentInvoiceId), eq(invoice.status, "partially_paid")));
    }
    return;
  }

  const nextStatus = cleared
    ? inv.status
    : paid > 0.005 && ["sent", "viewed", "overdue", "paid", "partially_paid"].includes(inv.status)
      ? "partially_paid"
      : inv.status === "paid" || inv.status === "partially_paid"
        ? "sent"
        : inv.status;
  await db
    .update(invoice)
    .set({ amountPaid: String(paid.toFixed(2)), status: nextStatus, paidAt: cleared ? inv.paidAt : null, updatedAt: new Date() })
    .where(eq(invoice.id, invoiceId));

  if (inv.depositPercent && paid + 0.5 >= depositDue(inv)) {
    await advanceRequestAfterDeposit(inv);
  }
}
