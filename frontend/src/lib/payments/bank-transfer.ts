import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoice, payment, serviceRequest, type Invoice } from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit";
import { formatMoney } from "@/lib/invoice/money";
import { amountFor, isPayable } from "@/lib/payments/amounts";
import { notifyClient, simpleEmail } from "@/lib/requests/people";
import { notifyUsers, userIdsWithRole } from "@/lib/notifications";

/**
 * Bank transfer with proof. The client transfers, uploads the receipt (private
 * R2, key `payments/<invoiceId>/…`), and a `payment` row is created with
 * provider 'bank_transfer', status 'pending'. Admins are told; one of them
 * confirms (→ money applied through the same paths as Paystack) or rejects.
 *
 *   submitTransferProof   — client side (dashboard pay page)
 *   confirmTransferPayment / rejectTransferPayment — admin side (the Admin
 *   dashboard wires the buttons; both functions re-check nothing about the
 *   caller, so callers MUST be admin-guarded).
 */

export const PROOF_PREFIX = (invoiceId: string) => `payments/${invoiceId}/`;

export async function pendingTransfer(invoiceId: string) {
  const [row] = await db
    .select()
    .from(payment)
    .where(and(eq(payment.invoiceId, invoiceId), eq(payment.provider, "bank_transfer"), eq(payment.status, "pending")));
  return row ?? null;
}

export async function submitTransferProof(input: {
  inv: Invoice;
  option: string;
  proofKey: string;
  proofFileName: string;
  actor: { userId: string; name: string };
}): Promise<{ ok: true; paymentId: string; amount: number } | { ok: false; error: string }> {
  const { inv } = input;
  if (!isPayable(inv)) return { ok: false, error: "This invoice is not awaiting payment." };
  const amount = amountFor(inv, input.option);
  if (amount === null) return { ok: false, error: "Choose how much you transferred." };
  if (!input.proofKey.startsWith(PROOF_PREFIX(inv.id))) return { ok: false, error: "Upload the receipt again." };
  if (await pendingTransfer(inv.id)) return { ok: false, error: "We are already checking a transfer on this invoice. We will email you once it is confirmed." };

  const [req] = await db.select({ id: serviceRequest.id }).from(serviceRequest).where(eq(serviceRequest.invoiceId, inv.id));
  const [row] = await db
    .insert(payment)
    .values({
      reference: `BT-${inv.number}-${randomBytes(3).toString("hex")}`,
      provider: "bank_transfer",
      channel: "bank_transfer",
      invoiceId: inv.id,
      requestId: req?.id ?? null,
      clientId: inv.clientId,
      status: "pending",
      amount: amount.toFixed(2),
      currency: inv.currency,
      proofKey: input.proofKey,
      proofFileName: input.proofFileName.slice(0, 200),
    })
    .returning({ id: payment.id });

  await recordAudit({
    actorId: input.actor.userId,
    actorName: input.actor.name,
    action: "payment.transfer_proof_uploaded",
    entity: "payment",
    entityId: row.id,
    meta: { invoice: inv.number, amount, option: input.option },
  });
  // Admins only: confirming money is an admin job and the note carries an amount.
  await notifyUsers({
    userIds: await userIdsWithRole("admin"),
    category: "billing",
    title: `Transfer to confirm on ${inv.number}`,
    body: `${inv.billToCompany || inv.billToName || "A client"} uploaded a bank transfer receipt (${formatMoney(amount, inv.currency)}). Check the bank and confirm.`,
    link: `/admin/finance/invoices/${inv.id}`,
    dedupeKey: `transfer-proof:${row.id}`,
  }).catch((e) => console.error("[transfer] notify failed:", e));
  return { ok: true, paymentId: row.id, amount };
}

/** Admin confirms the money arrived. Idempotent (conditional claim). */
export async function confirmTransferPayment(paymentId: string, admin: { id: string; name: string }) {
  const claimed = await db
    .update(payment)
    .set({ status: "success", confirmedBy: admin.id, confirmedAt: new Date(), paidAt: new Date(), verifiedAt: new Date(), amountSettled: sql`${payment.amount}`, updatedAt: new Date() })
    .where(and(eq(payment.id, paymentId), eq(payment.provider, "bank_transfer"), eq(payment.status, "pending")))
    .returning();
  if (!claimed.length) return { ok: false as const, error: "This transfer was already handled." };
  const pay = claimed[0];
  const [inv] = await db.select().from(invoice).where(eq(invoice.id, pay.invoiceId));
  if (!inv) return { ok: false as const, error: "Invoice not found." };

  const amount = Number(pay.amount);
  if (Number(inv.amountPaid ?? 0) + amount < Number(inv.total) - 0.005) {
    const { applyInvoicePartPaid } = await import("@/lib/payments/partial");
    await applyInvoicePartPaid(inv, amount, { via: "bank_transfer", paymentRequestId: pay.requestId });
  } else {
    const { applyInvoicePaid } = await import("@/lib/payments/apply");
    await applyInvoicePaid(inv, { via: "manual", paymentRequestId: pay.requestId });
  }
  await recordAudit({ actorId: admin.id, actorName: admin.name, action: "payment.transfer_confirmed", entity: "payment", entityId: pay.id, meta: { invoice: inv.number, amount } });
  return { ok: true as const };
}

/** Admin could not find the money: the client is told why and can try again. */
export async function rejectTransferPayment(paymentId: string, admin: { id: string; name: string }, reason: string) {
  const claimed = await db
    .update(payment)
    .set({ status: "rejected", confirmedBy: admin.id, confirmedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(payment.id, paymentId), eq(payment.provider, "bank_transfer"), eq(payment.status, "pending")))
    .returning();
  if (!claimed.length) return { ok: false as const, error: "This transfer was already handled." };
  const pay = claimed[0];
  const [inv] = await db.select().from(invoice).where(eq(invoice.id, pay.invoiceId));
  await recordAudit({ actorId: admin.id, actorName: admin.name, action: "payment.transfer_rejected", entity: "payment", entityId: pay.id, meta: { reason } });
  if (inv?.clientId) {
    const link = `/dashboard/billing/pay?invoice=${inv.id}`;
    await notifyClient(inv.clientId, {
      category: "billing",
      title: `We could not confirm your transfer for ${inv.number}`,
      body: reason,
      link,
      dedupeKey: `transfer-rejected:${pay.id}`,
      email: await simpleEmail({
        subject: `We could not confirm your transfer — ${inv.number}`,
        heading: "We could not confirm your transfer",
        body: `${reason} You can upload another receipt or pay by card from your dashboard.`,
        href: link,
        cta: "Open payment",
      }),
    });
  }
  return { ok: true as const };
}
