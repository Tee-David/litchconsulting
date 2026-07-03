import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { InvoiceBuilder } from "@/components/admin/invoice/invoice-builder";
import { listClients } from "@/lib/db/queries/clients";
import { nextInvoiceNumber } from "@/lib/db/queries/invoices";
import { getIssuer } from "@/lib/invoice/get-issuer";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage() {
  const [clients, number, issuer] = await Promise.all([listClients(), nextInvoiceNumber(), getIssuer()]);
  return (
    <div className="space-y-5">
      <Link href="/admin/finance/invoices" className="inline-flex items-center gap-1.5 text-sm font-medium text-body hover:text-ink">
        <ArrowLeft className="size-4" /> Invoices
      </Link>
      <h2 className="font-display text-lg font-bold text-ink">New invoice</h2>
      <InvoiceBuilder clients={clients} defaultNumber={number} issuer={issuer} />
    </div>
  );
}
