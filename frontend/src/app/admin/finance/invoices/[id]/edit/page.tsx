import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getInvoice } from "@/lib/db/queries/invoices";
import { listClients } from "@/lib/db/queries/clients";
import { toInvoiceInput } from "@/lib/invoice/map";
import { InvoiceBuilder } from "@/components/admin/invoice/invoice-builder";

export const dynamic = "force-dynamic";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, clients] = await Promise.all([getInvoice(id), listClients()]);
  if (!data) notFound();
  const initial = toInvoiceInput(data.invoice, data.items);

  return (
    <div className="space-y-5">
      <Link href={`/admin/finance/invoices/${id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-body hover:text-ink">
        <ArrowLeft className="size-4" /> Back to invoice
      </Link>
      <h2 className="font-display text-lg font-bold text-ink">Edit {initial.number}</h2>
      <InvoiceBuilder initial={initial} clients={clients} defaultNumber={initial.number} />
    </div>
  );
}
