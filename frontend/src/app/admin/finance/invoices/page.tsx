import Link from "next/link";
import { Plus } from "lucide-react";
import { listInvoices } from "@/lib/db/queries/invoices";
import { InvoiceList } from "@/components/admin/invoice/invoice-list";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const invoices = await listInvoices();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-body">Create, send and track invoices.</p>
        <Link
          href="/admin/finance/invoices/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          <Plus className="size-4" /> New invoice
        </Link>
      </div>
      <InvoiceList invoices={invoices} />
    </div>
  );
}
