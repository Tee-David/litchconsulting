import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getInvoice } from "@/lib/db/queries/invoices";
import { toInvoiceData } from "@/lib/invoice/map";
import { getIssuer } from "@/lib/invoice/get-issuer";
import { qrDataUrl } from "@/lib/invoice/pdf/render";
import { siteOrigin } from "@/lib/site-url";
import { InvoicePreview } from "@/components/admin/invoice/invoice-preview";
import { QuoteViewActions } from "@/components/admin/invoice/quote-view-actions";
import { Badge, invoiceStatusTone } from "@/components/admin/ui/badge";

export const dynamic = "force-dynamic";

export default async function ViewQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, issuer] = await Promise.all([getInvoice(id), getIssuer()]);
  if (!data || data.invoice.kind !== "quote") notFound();
  const quoteData = toInvoiceData(data.invoice, data.items);
  const qr = data.invoice.publicToken ? await qrDataUrl(`${siteOrigin()}/i/${data.invoice.publicToken}`) : undefined;

  return (
    <div className="space-y-5">
      <Link href="/admin/finance/quotes" className="inline-flex items-center gap-1.5 text-sm font-medium text-body hover:text-ink">
        <ArrowLeft className="size-4" /> Quotes
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg font-bold text-ink">{data.invoice.number}</h2>
          <Badge tone={invoiceStatusTone(data.invoice.status)}>{data.invoice.status}</Badge>
        </div>
        <QuoteViewActions id={data.invoice.id} status={data.invoice.status} />
      </div>
      <InvoicePreview data={quoteData} issuer={issuer} variant="quote" qrDataUrl={qr} />
    </div>
  );
}
