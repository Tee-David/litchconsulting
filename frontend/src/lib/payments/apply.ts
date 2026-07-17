import "server-only";
import { and, eq, notInArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  invoice,
  payment,
  serviceRequest,
  serviceRequestEvent,
  type Invoice,
} from "@/lib/db/schema";
import { koboFromTotal, type PaystackTransaction } from "@/lib/paystack";
import { notifyAdmin } from "@/lib/notify";
import { recordAudit } from "@/lib/audit";
import type { RequiredDocument } from "@/lib/services/catalog";

/**
 * THE single place a payment becomes money. All three entry points delegate
 * here — the Paystack webhook, the callback-page verify, and the admin's
 * manual mark-as-paid — so side effects (invoice paid, request advanced,
 * events, receipt email, admin alert) can never diverge or double-fire.
 *
 * Idempotency: one conditional UPDATE on the payment row. Whoever flips it
 * first wins; every later attempt (webhook replay, callback after webhook,
 * double-click) matches zero rows and returns early.
 */

export type ApplyOutcome =
  | "applied"
  | "already_applied"
  | "flagged_amount_mismatch"
  | "duplicate_success"
  | "not_found";

export type ApplyResult = {
  outcome: ApplyOutcome;
  invoiceId?: string;
  requestId?: string | null;
  publicToken?: string | null;
};

function baseUrl() {
  return (
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://litchconsulting.com"
  ).replace(/\/$/, "");
}

/** Bounded retry for CockroachDB serializable aborts (code 40001). */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const code = (err as { code?: string })?.code;
      if (code !== "40001") throw err;
      await new Promise((r) => setTimeout(r, 100 * (i + 1)));
    }
  }
  throw lastErr;
}

/** Verified Paystack success → apply to our records. Idempotent, race-safe. */
export async function applySuccessfulPayment(
  reference: string,
  data: PaystackTransaction,
  via: "webhook" | "callback"
): Promise<ApplyResult> {
  return withRetry(async () => {
    // 1. Claim the payment row (idempotency gate).
    const claimed = await db
      .update(payment)
      .set({
        status: "success",
        amountSettled: data.amount != null ? String(data.amount / 100) : null,
        channel: data.channel ?? null,
        paystackId: data.id != null ? String(data.id) : null,
        rawEvent: data as Record<string, unknown>,
        paidAt: data.paid_at ? new Date(data.paid_at) : new Date(),
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(payment.reference, reference),
          notInArray(payment.status, ["success", "duplicate_success"])
        )
      )
      .returning();
    if (claimed.length === 0) return { outcome: "already_applied" as const };
    const pay = claimed[0];

    const [inv] = await db.select().from(invoice).where(eq(invoice.id, pay.invoiceId));
    if (!inv) return { outcome: "not_found" as const };

    // 2. Amount/currency must match what the invoice asked for.
    const expectedKobo = koboFromTotal(inv.total);
    const currencyOk = (data.currency ?? "NGN").toUpperCase() === inv.currency.toUpperCase();
    if ((data.amount ?? 0) < expectedKobo || !currencyOk) {
      await db
        .update(payment)
        .set({ status: "flagged_amount_mismatch", updatedAt: new Date() })
        .where(eq(payment.id, pay.id));
      await notifyAdmin({
        subject: `⚠️ Payment amount mismatch on ${inv.number}`,
        html: `<p>Paystack reported <strong>${(data.amount ?? 0) / 100} ${data.currency ?? "?"}</strong> for invoice <strong>${inv.number}</strong> (expected ${inv.total} ${inv.currency}). Reference <code>${reference}</code> via ${via}. The invoice was NOT marked paid.</p>`,
        href: `${baseUrl()}/admin/finance/invoices/${inv.id}`,
      });
      return { outcome: "flagged_amount_mismatch" as const, invoiceId: inv.id };
    }

    // 3. Manual transfer (or another charge) beat us to it.
    if (inv.status === "paid") {
      await db
        .update(payment)
        .set({ status: "duplicate_success", updatedAt: new Date() })
        .where(eq(payment.id, pay.id));
      await notifyAdmin({
        subject: `⚠️ Double payment on ${inv.number} — refund needed`,
        html: `<p>Invoice <strong>${inv.number}</strong> was already paid, but Paystack charge <code>${reference}</code> also succeeded. Refund it from the Paystack dashboard.</p>`,
        href: `${baseUrl()}/admin/finance/invoices/${inv.id}`,
      });
      return { outcome: "duplicate_success" as const, invoiceId: inv.id };
    }

    // 4. The real thing.
    const requestId = await applyInvoicePaid(inv, {
      via,
      paymentRequestId: pay.requestId,
    });
    return {
      outcome: "applied" as const,
      invoiceId: inv.id,
      requestId,
      publicToken: inv.publicToken,
    };
  });
}

/**
 * Mark an invoice paid and run every downstream effect. Shared by Paystack
 * success (above) and the admin's manual mark-as-paid (which passes via
 * "manual" and has no payment row). Returns the linked request id, if any.
 */
export async function applyInvoicePaid(
  inv: Invoice,
  opts: { via: "webhook" | "callback" | "manual"; paymentRequestId?: string | null }
): Promise<string | null> {
  const now = new Date();
  await db
    .update(invoice)
    .set({ status: "paid", amountPaid: inv.total, paidAt: now, updatedAt: now })
    .where(eq(invoice.id, inv.id));

  // Advance the linked service request, if there is one.
  let req = null;
  if (opts.paymentRequestId) {
    const rows = await db
      .select()
      .from(serviceRequest)
      .where(eq(serviceRequest.id, opts.paymentRequestId));
    req = rows[0] ?? null;
  }
  if (!req) {
    const rows = await db
      .select()
      .from(serviceRequest)
      .where(eq(serviceRequest.invoiceId, inv.id));
    req = rows[0] ?? null;
  }

  if (req && req.status === "pending_payment") {
    const docs = (req.requiredDocuments as RequiredDocument[]) ?? [];
    const needsDocs = docs.some((d) => d.required);
    const toStatus = needsDocs ? "awaiting_documents" : "in_progress";
    await db
      .update(serviceRequest)
      .set({ status: toStatus, updatedAt: now })
      .where(eq(serviceRequest.id, req.id));
    await db.insert(serviceRequestEvent).values([
      {
        requestId: req.id,
        type: "payment_received",
        message: `Payment received for invoice ${inv.number}.`,
        visibility: "client",
        actorRole: "system",
      },
      {
        requestId: req.id,
        type: "status_changed",
        fromStatus: "pending_payment",
        toStatus,
        message: needsDocs
          ? "Next step: upload your documents so we can get started."
          : "We're on it — work has started on your request.",
        visibility: "client",
        actorRole: "system",
      },
    ]);
  }

  // Receipt email to the client (best-effort — never blocks the payment).
  try {
    if (inv.billToEmail) {
      const { getInvoice } = await import("@/lib/db/queries/invoices");
      const data = await getInvoice(inv.id);
      if (data) {
        const { renderInvoicePdf } = await import("@/lib/invoice/pdf/render");
        const { getIssuer } = await import("@/lib/invoice/get-issuer");
        const { sendEmail, emailLayout, emailButton, emailDetailRows, EMAIL_ICONS } = await import("@/lib/email");
        const { formatMoney } = await import("@/lib/invoice/money");
        const pdf = await renderInvoicePdf(
          {
            number: inv.number,
            status: "paid",
            issueDate: inv.issueDate,
            dueDate: inv.dueDate,
            currency: inv.currency,
            projectTitle: inv.projectTitle,
            billTo: {
              name: inv.billToName || undefined,
              company: inv.billToCompany || undefined,
              email: inv.billToEmail || undefined,
              address: inv.billToAddress || undefined,
              taxId: inv.billToTaxId || undefined,
            },
            items: data.items.map((it) => ({
              description: it.description,
              detail: it.detail || undefined,
              quantity: Number(it.quantity),
              unitPrice: Number(it.unitPrice),
              taxRate: Number(it.taxRate),
            })),
            notes: inv.notes,
            terms: inv.terms,
          },
          "receipt",
          await getIssuer()
        );
        const nextStep = req
          ? `<p style="margin:18px 0 12px;">${emailButton(
              `${baseUrl()}/dashboard/requests/${req.id}`,
              ((req.requiredDocuments as RequiredDocument[]) ?? []).some((d) => d.required)
                ? "Upload your documents"
                : "Track your request",
              EMAIL_ICONS.arrow,
            )}</p>`
          : "";
        await sendEmail({
          to: inv.billToEmail,
          subject: `Payment received — receipt for ${inv.number}`,
          html: emailLayout(
            `
            <p style="margin:0 0 6px;font-size:20px;font-weight:700;">Payment received</p>
            <p class="body" style="margin:0 0 18px;color:#41485a;">Thank you, ${inv.billToName || "there"} — we've received your payment for <strong>${inv.number}</strong>. Your receipt is attached as a PDF.</p>
            ${emailDetailRows([
              { label: "Invoice", value: inv.number },
              ...(inv.projectTitle ? [{ label: "Project", value: inv.projectTitle }] : []),
              { label: "Amount paid", value: formatMoney(Number(inv.total), inv.currency), strong: true },
            ])}
            ${nextStep}
          `,
            { preheader: `Your payment for ${inv.number} was received — receipt attached.` },
          ),
          attachments: [
            { filename: `${inv.number}-receipt.pdf`, content: pdf, contentType: "application/pdf" },
          ],
        });
      }
    }
  } catch (err) {
    console.error("[payments] receipt email failed:", err);
  }

  await recordAudit({
    // Manual mark-paid runs in a server-action request scope, so recordAudit
    // resolves the acting admin; Paystack webhook/callback have no session.
    actorName: opts.via === "manual" ? null : "Paystack",
    action: "payment.applied",
    entity: "invoice",
    entityId: inv.id,
    meta: { number: inv.number, total: inv.total, currency: inv.currency, via: opts.via },
  });

  await notifyAdmin({
    subject: `₦ Payment received — ${inv.number}${req ? ` (${req.number})` : ""}`,
    html: `<p><strong>${inv.currency} ${inv.total}</strong> received on invoice <strong>${inv.number}</strong>${
      req ? ` for request <strong>${req.number}</strong> (${req.serviceName})` : ""
    } via ${opts.via}.</p>`,
    href: `${baseUrl()}/admin/finance/invoices/${inv.id}`,
  });

  try {
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/admin/finance/invoices");
    revalidatePath("/admin/finance/receipts");
    revalidatePath("/admin/requests");
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/invoices");
    revalidatePath("/dashboard/requests");
    if (req) revalidatePath(`/dashboard/requests/${req.id}`);
  } catch {
    // revalidatePath is unavailable outside a request scope (e.g. webhook) — safe to skip
  }

  return req?.id ?? null;
}
