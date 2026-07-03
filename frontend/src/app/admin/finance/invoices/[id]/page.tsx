import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getInvoice } from "@/lib/db/queries/invoices";
import { toInvoiceData } from "@/lib/invoice/map";
import { getIssuer } from "@/lib/invoice/get-issuer";
import { InvoicePreview } from "@/components/admin/invoice/invoice-preview";
import { InvoiceViewActions } from "@/components/admin/invoice/invoice-view-actions";
import { Badge, invoiceStatusTone } from "@/components/admin/ui/badge";

export const dynamic = "force-dynamic";

export default async function ViewInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, issuer] = await Promise.all([getInvoice(id), getIssuer()]);
  if (!data) notFound();
  const invoiceData = toInvoiceData(data.invoice, data.items);

  return (
    <div className="space-y-5">
      <Link href="/admin/finance/invoices" className="inline-flex items-center gap-1.5 text-sm font-medium text-body hover:text-ink">
        <ArrowLeft className="size-4" /> Invoices
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg font-bold text-ink">{data.invoice.number}</h2>
          <Badge tone={invoiceStatusTone(data.invoice.status)}>{data.invoice.status}</Badge>
        </div>
        <InvoiceViewActions id={data.invoice.id} status={data.invoice.status} />
      </div>
      <InvoicePreview data={invoiceData} issuer={issuer} />
    </div>
  );
}
