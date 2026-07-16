import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { payment, invoice } from "@/lib/db/schema";
import { isValidWebhookSignature, type PaystackTransaction } from "@/lib/paystack";
import { applySuccessfulPayment } from "@/lib/payments/apply";
import { notifyAdmin } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * Paystack webhook. Signature = HMAC-SHA512 of the RAW body with the secret
 * key. Paystack retries non-200 responses for 72 hours, so once we've
 * verified the signature we always return 200 — idempotency in
 * applySuccessfulPayment makes replays harmless.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!isValidWebhookSignature(raw, req.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: { event?: string; data?: PaystackTransaction };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true }); // unparseable but signed — ack, nothing to do
  }

  try {
    switch (event.event) {
      case "charge.success": {
        const data = event.data ?? {};
        const reference = data.reference;
        if (!reference) break;

        const known = await db
          .select({ id: payment.id })
          .from(payment)
          .where(eq(payment.reference, reference))
          .limit(1);

        if (known.length === 0) {
          // A legit charge for an invoice we know, but no init row (e.g. row
          // lost, or charge made from a stale link): reconstruct from metadata.
          const invoiceId = (data.metadata as Record<string, unknown> | null)?.invoiceId;
          if (typeof invoiceId === "string") {
            const [inv] = await db.select().from(invoice).where(eq(invoice.id, invoiceId));
            if (inv) {
              await db
                .insert(payment)
                .values({
                  reference,
                  invoiceId: inv.id,
                  requestId:
                    typeof (data.metadata as Record<string, unknown>)?.requestId === "string"
                      ? ((data.metadata as Record<string, unknown>).requestId as string)
                      : null,
                  clientId: inv.clientId,
                  amount: inv.total,
                  currency: inv.currency,
                  status: "initialized",
                })
                .onConflictDoNothing();
            } else {
              console.warn("[paystack] charge.success for unknown invoice", invoiceId);
              break;
            }
          } else {
            console.warn("[paystack] charge.success with unknown reference", reference);
            break;
          }
        }

        await applySuccessfulPayment(reference, data, "webhook");
        break;
      }
      case "refund.processed": {
        await notifyAdmin({
          subject: "Paystack refund processed",
          html: `<p>Paystack reports a processed refund. Review the transaction and set the linked request to <strong>refunded</strong> if you haven't already.</p><pre style="font-size:12px;color:#5b6474;">${JSON.stringify(
            event.data ?? {},
            null,
            2
          ).slice(0, 2000)}</pre>`,
        });
        break;
      }
      default:
        break; // ignore other events in v1
    }
  } catch (err) {
    // We've persisted enough to reconcile (payment rows/flags); returning 200
    // stops the 72h retry storm. The failure is logged for follow-up.
    console.error("[paystack] webhook handler error:", err);
  }

  return NextResponse.json({ ok: true });
}
