import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getInvoice } from "@/lib/db/queries/invoices";
import { paymentsForInvoice } from "@/lib/db/queries/payments";
import { toInvoiceData } from "@/lib/invoice/map";
import { getIssuer } from "@/lib/invoice/get-issuer";
import { qrDataUrl } from "@/lib/invoice/pdf/render";
import { siteOrigin } from "@/lib/site-url";
import { num } from "@/lib/invoice/money";
import { InvoicePreview } from "@/components/admin/invoice/invoice-preview";
import { InvoiceViewActions } from "@/components/admin/invoice/invoice-view-actions";
import { InvoicePaymentsCard } from "@/components/admin/invoice/invoice-payments-card";
import { InvoiceTimeline } from "@/components/admin/invoice/invoice-timeline";
import { Badge, invoiceStatusTone } from "@/components/admin/ui/badge";

export const dynamic = "force-dynamic";

export default async function ViewInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, issuer] = await Promise.all([getInvoice(id), getIssuer()]);
  if (!data) notFound();
  const inv = data.invoice;
  const invoiceData = toInvoiceData(inv, data.items);
  const payments = await paymentsForInvoice(inv.id);
  // Same "Scan to pay" QR the PDF embeds, so the preview and the download match.
  const qr = inv.publicToken ? await qrDataUrl(`${siteOrigin()}/i/${inv.publicToken}`) : undefined;

  // Part-paid is a real state the status column can't express on its own.
  const paid = num(inv.amountPaid);
  const partial = inv.status !== "paid" && paid > 0 && paid < num(inv.total);

  return (
    <div className="space-y-5">
      <Link href="/admin/finance/invoices" className="inline-flex items-center gap-1.5 text-sm font-medium text-body hover:text-ink">
        <ArrowLeft className="size-4" /> Invoices
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-lg font-bold text-ink">{inv.number}</h2>
          <Badge tone={invoiceStatusTone(inv.status)}>{inv.status}</Badge>
          {partial && <Badge tone="warning">Partial payment</Badge>}
        </div>
        <InvoiceViewActions
          id={inv.id}
          status={inv.status}
          number={inv.number}
          publicToken={inv.publicToken}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <InvoicePreview data={invoiceData} issuer={issuer} qrDataUrl={qr} />
        <div className="space-y-5">
          <InvoicePaymentsCard
            invoiceId={inv.id}
            currency={inv.currency}
            total={inv.total}
            amountPaid={inv.amountPaid}
            payments={payments.map((p) => {
              const raw = (p.rawEvent ?? {}) as Record<string, unknown>;
              const auth = (raw.authorization ?? {}) as Record<string, unknown>;
              const customer = (raw.customer ?? {}) as Record<string, unknown>;
              const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
              return {
                id: p.id,
                provider: p.provider,
                status: p.status,
                reference: p.reference,
                amount: p.amount,
                amountSettled: p.amountSettled,
                currency: p.currency,
                channel: p.channel,
                paystackId: p.paystackId,
                note: str(raw.note) ?? null,
                paidAt: p.paidAt ? p.paidAt.toISOString() : null,
                verifiedAt: p.verifiedAt ? p.verifiedAt.toISOString() : null,
                createdAt: p.createdAt.toISOString(),
                meta:
                  p.provider === "manual"
                    ? null
                    : {
                        gatewayResponse: str(raw.gateway_response),
                        bank: str(auth.bank),
                        cardType: str(auth.card_type),
                        last4: str(auth.last4),
                        customerEmail: str(customer.email),
                        fees: typeof raw.fees === "number" ? raw.fees / 100 : undefined,
                      },
              };
            })}
          />
          <InvoiceTimeline invoice={inv} />
        </div>
      </div>
    </div>
  );
}
