import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoice, serviceRequest, serviceRequestEvent, type Invoice } from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit";
import { notifyAdmin } from "@/lib/notify";
import { formatMoney } from "@/lib/invoice/money";
import type { RequiredDocument } from "@/lib/services/catalog";
import { notifyClient, notifyFirm, simpleEmail } from "@/lib/requests/people";

/**
 * Part payments (deposits). A deposit moves the invoice to `partially_paid`,
 * adds to `amount_paid`, and starts the work exactly like a full payment does
 * (pending_payment → awaiting_documents | in_progress). The balance is paid
 * later on the same invoice; when it lands, applyInvoicePaid() closes it.
 *
 * Called from applySuccessfulPayment (Paystack) and confirmTransferPayment
 * (bank transfer), both of which have already claimed their payment row, so
 * this runs once per payment.
 */

/** pending_payment → next status, with client-visible events. Returns the request id. */
export async function advanceRequestAfterPayment(
  inv: Invoice,
  opts: { paymentRequestId?: string | null; message: string },
): Promise<string | null> {
  let req = null;
  if (opts.paymentRequestId) {
    [req] = await db.select().from(serviceRequest).where(eq(serviceRequest.id, opts.paymentRequestId));
  }
  if (!req) [req] = await db.select().from(serviceRequest).where(eq(serviceRequest.invoiceId, inv.id));
  if (!req) return null;
  if (req.status === "pending_payment") {
    const needsDocs = ((req.requiredDocuments as RequiredDocument[]) ?? []).some((d) => d.required);
    const toStatus = needsDocs ? "awaiting_documents" : "in_progress";
    await db.update(serviceRequest).set({ status: toStatus, updatedAt: new Date() }).where(eq(serviceRequest.id, req.id));
    await db.insert(serviceRequestEvent).values([
      { requestId: req.id, type: "payment_received", message: opts.message, visibility: "client", actorRole: "system" },
      {
        requestId: req.id,
        type: "status_changed",
        fromStatus: "pending_payment",
        toStatus,
        message: needsDocs ? "Next step: upload your documents so we can get started." : "We're on it — work has started on your request.",
        visibility: "client",
        actorRole: "system",
      },
    ]);
  } else {
    await db.insert(serviceRequestEvent).values({ requestId: req.id, type: "payment_received", message: opts.message, visibility: "client", actorRole: "system" });
  }
  return req.id;
}

export async function applyInvoicePartPaid(
  inv: Invoice,
  amount: number,
  opts: { via: "webhook" | "callback" | "manual" | "bank_transfer"; paymentRequestId?: string | null },
): Promise<string | null> {
  const paid = Math.round((Number(inv.amountPaid ?? 0) + amount) * 100) / 100;
  await db.update(invoice).set({ status: "partially_paid", amountPaid: paid.toFixed(2), updatedAt: new Date() }).where(eq(invoice.id, inv.id));
  const balance = Math.max(0, Number(inv.total) - paid);
  const label = inv.depositPercent ? "Deposit" : "Part payment";
  const requestId = await advanceRequestAfterPayment(inv, {
    paymentRequestId: opts.paymentRequestId,
    message: `${label} of ${formatMoney(amount, inv.currency)} received for ${inv.number}. Balance ${formatMoney(balance, inv.currency)}.`,
  });

  await recordAudit({
    actorName: opts.via === "manual" || opts.via === "bank_transfer" ? null : "Paystack",
    action: "payment.applied_partial",
    entity: "invoice",
    entityId: inv.id,
    meta: { number: inv.number, amount, paid, total: inv.total, via: opts.via },
  });

  if (inv.clientId) {
    const link = requestId ? `/dashboard/requests/${requestId}` : "/dashboard/billing";
    await notifyClient(inv.clientId, {
      category: "billing",
      title: `${label} received for ${inv.number}`,
      body: `${formatMoney(amount, inv.currency)} received. Balance ${formatMoney(balance, inv.currency)}, due on delivery.`,
      link,
      dedupeKey: `part-paid:${inv.id}:${paid.toFixed(2)}`,
      email: await simpleEmail({
        subject: `${label} received — ${inv.number}`,
        heading: `${label} received`,
        body: `Thank you. We received ${formatMoney(amount, inv.currency)} on ${inv.number}. The balance of ${formatMoney(balance, inv.currency)} is due on delivery. Work starts now.`,
        href: link,
        cta: "Track your request",
      }),
    });
  }
  await notifyFirm(requestId, {
    category: "billing",
    title: `${label} received on ${inv.number}`,
    body: `${inv.billToCompany || inv.billToName || "Client"} paid part of the invoice. Work can start.`,
    dedupeKey: `part-paid-firm:${inv.id}:${paid.toFixed(2)}`,
    adminLink: `/admin/finance/invoices/${inv.id}`,
  });
  await notifyAdmin({
    subject: `₦ ${label} received — ${inv.number}`,
    html: `<p><strong>${formatMoney(amount, inv.currency)}</strong> received on <strong>${inv.number}</strong> via ${opts.via}. Balance ${formatMoney(balance, inv.currency)}.</p>`,
  });

  try {
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/dashboard", "layout");
    revalidatePath("/admin/finance/invoices");
    revalidatePath("/work", "layout");
  } catch {
    /* outside a request scope (webhook) */
  }
  return requestId;
}
