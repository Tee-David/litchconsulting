import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getInvoice } from "@/lib/db/queries/invoices";
import { toInvoiceData } from "@/lib/invoice/map";
import { getIssuer } from "@/lib/invoice/get-issuer";
import { qrDataUrl } from "@/lib/invoice/pdf/render";
import { siteOrigin } from "@/lib/site-url";
import { num } from "@/lib/invoice/money";
import { InvoicePreview } from "@/components/admin/invoice/invoice-preview";
import { QuoteViewActions } from "@/components/admin/invoice/quote-view-actions";
import { QuoteDepositCard } from "@/components/admin/billing/quote-deposit-card";
import { StatusChip } from "@/components/kit";

export const dynamic = "force-dynamic";

export default async function ViewQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, issuer] = await Promise.all([getInvoice(id), getIssuer()]);
  if (!data || data.invoice.kind !== "quote") notFound();
  const q = data.invoice;
  const quoteData = toInvoiceData(q, data.items);
  const qr = q.publicToken ? await qrDataUrl(`${siteOrigin()}/i/${q.publicToken}`) : undefined;

  return (
    <div className="space-y-5">
      <Link href="/admin/billing?view=quotes" className="inline-flex items-center gap-1.5 text-sm font-medium text-body hover:text-ink">
        <ArrowLeft className="size-4" /> Billing
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{q.number}</h1>
          <StatusChip domain="quote" status={q.status} suffix={q.depositPercent ? `${q.depositPercent}% deposit` : undefined} />
        </div>
        <QuoteViewActions id={q.id} status={q.status} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <InvoicePreview data={quoteData} issuer={issuer} variant="quote" qrDataUrl={qr} />
        <QuoteDepositCard quoteId={q.id} status={q.status} currency={q.currency} total={num(q.total)} depositPercent={q.depositPercent} />
      </div>
    </div>
  );
}
