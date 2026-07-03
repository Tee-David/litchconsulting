import Link from "next/link";
import { Plus } from "lucide-react";
import { listQuotes } from "@/lib/db/queries/invoices";
import { QuoteList } from "@/components/admin/invoice/quote-list";

export const dynamic = "force-dynamic";

export default async function QuotesPage() {
  const quotes = await listQuotes();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-body">Draft, send and track quotes — convert accepted quotes into invoices.</p>
        <Link
          href="/admin/finance/quotes/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          <Plus className="size-4" /> New quote
        </Link>
      </div>
      <QuoteList quotes={quotes} />
    </div>
  );
}
