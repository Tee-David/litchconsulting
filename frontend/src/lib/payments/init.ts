import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { payment, type Invoice } from "@/lib/db/schema";
import { initializeTransaction, koboFromTotal, mintReference, paystackConfigured } from "@/lib/paystack";

/**
 * Start a Paystack checkout for an invoice. Mints a fresh reference per
 * attempt (access codes expire; old rows become `abandoned` via the sweep),
 * records the attempt, and returns the hosted authorization URL.
 * Used by the dashboard request action AND the public /i/[token] pay flow.
 */
export async function initInvoicePayment(
  inv: Invoice,
  opts?: { requestId?: string | null; email?: string | null }
): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!paystackConfigured()) return { ok: false, error: "Online payment isn't available yet — use the bank transfer details on the invoice." };
  if (inv.kind !== "invoice") return { ok: false, error: "Quotes can't be paid — convert to an invoice first." };
  if (inv.status === "paid") return { ok: false, error: "This invoice is already paid." };
  if (!["sent", "overdue"].includes(inv.status)) return { ok: false, error: "This invoice isn't payable yet." };
  if (inv.currency !== "NGN") return { ok: false, error: "Online payment is only available for NGN invoices." };

  const email = opts?.email || inv.billToEmail;
  if (!email) return { ok: false, error: "No billing email on this invoice." };

  const baseUrl = (
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://litchconsulting.com"
  ).replace(/\/$/, "");

  const reference = mintReference(inv.number);
  const [row] = await db
    .insert(payment)
    .values({
      reference,
      invoiceId: inv.id,
      requestId: opts?.requestId ?? null,
      clientId: inv.clientId,
      amount: inv.total,
      currency: inv.currency,
      status: "initialized",
    })
    .returning({ id: payment.id });

  const init = await initializeTransaction({
    email,
    amountKobo: koboFromTotal(inv.total),
    reference,
    callbackUrl: `${baseUrl}/pay/callback`,
    metadata: { invoiceId: inv.id, requestId: opts?.requestId ?? null, clientId: inv.clientId },
  });

  if (!init.ok || !init.authorizationUrl) {
    await db
      .update(payment)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(payment.id, row.id));
    return { ok: false, error: init.error || "Could not start payment." };
  }

  await db
    .update(payment)
    .set({ authorizationUrl: init.authorizationUrl, accessCode: init.accessCode ?? null, updatedAt: new Date() })
    .where(eq(payment.id, row.id));

  return { ok: true, url: init.authorizationUrl };
}
