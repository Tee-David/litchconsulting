import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getInvoice } from "@/lib/db/queries/invoices";
import { paymentsForInvoice } from "@/lib/db/queries/payments";
import { toInvoiceData } from "@/lib/invoice/map";
import { getIssuer } from "@/lib/invoice/get-issuer";
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
        <InvoicePreview data={invoiceData} issuer={issuer} />
        <div className="space-y-5">
          <InvoicePaymentsCard
            invoiceId={inv.id}
            currency={inv.currency}
            total={inv.total}
            amountPaid={inv.amountPaid}
            payments={payments.map((p) => ({
              id: p.id,
              provider: p.provider,
              status: p.status,
              reference: p.reference,
              amount: p.amount,
              amountSettled: p.amountSettled,
              channel: p.channel,
              paidAt: p.paidAt ? p.paidAt.toISOString() : null,
              createdAt: p.createdAt.toISOString(),
            }))}
          />
          <InvoiceTimeline invoice={inv} />
        </div>
      </div>
    </div>
  );
}
