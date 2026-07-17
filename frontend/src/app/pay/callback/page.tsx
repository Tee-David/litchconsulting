import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { payment, invoice } from "@/lib/db/schema";
import { verifyTransaction } from "@/lib/paystack";
import { applySuccessfulPayment } from "@/lib/payments/apply";

export const dynamic = "force-dynamic";
// Renders the receipt PDF via Chromium on cold start; give it headroom.
export const maxDuration = 60;

/**
 * Paystack redirects here after checkout (?reference= / ?trxref=). We verify
 * server-side (never trust the redirect alone) and apply the payment — a
 * no-op if the webhook already won the race — then send the payer to the
 * right home: their request workspace, or the public invoice page.
 */
export default async function PayCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; trxref?: string }>;
}) {
  const params = await searchParams;
  const reference = params.reference || params.trxref;
  if (!reference) redirect("/");

  const [row] = await db.select().from(payment).where(eq(payment.reference, reference));

  const fallback = async () => {
    if (!row) return "/";
    const [inv] = await db
      .select({ publicToken: invoice.publicToken })
      .from(invoice)
      .where(eq(invoice.id, row.invoiceId));
    if (row.requestId) return `/dashboard/requests/${row.requestId}`;
    return inv ? `/i/${inv.publicToken}` : "/";
  };

  const verified = await verifyTransaction(reference);
  if (!verified.ok || verified.data?.status !== "success") {
    // failed / abandoned / verify error → back to origin with a retry banner
    const base = await fallback();
    redirect(`${base}?payfail=1`);
  }

  const result = await applySuccessfulPayment(reference, verified.data!, "callback");

  if (result.outcome === "flagged_amount_mismatch") {
    const base = await fallback();
    redirect(`${base}?payflag=1`);
  }

  // applied | already_applied | duplicate_success all mean: money arrived.
  if (result.requestId ?? row?.requestId) {
    redirect(`/dashboard/requests/${result.requestId ?? row!.requestId}?paid=1`);
  }
  const base = await fallback();
  redirect(`${base}?paid=1`);
}
