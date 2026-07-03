import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CreditCard, CheckCircle2 } from "lucide-react";
import { getInvoiceByToken } from "@/lib/db/queries/invoices";
import { toInvoiceData } from "@/lib/invoice/map";
import { getIssuer } from "@/lib/invoice/get-issuer";
import { InvoicePreview } from "@/components/admin/invoice/invoice-preview";
import { Logo } from "@/components/ui/logo";
import { formatMoney, computeTotals } from "@/lib/invoice/money";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };

export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [data, issuer] = await Promise.all([getInvoiceByToken(token), getIssuer()]);
  if (!data) notFound();

  const invoiceData = toInvoiceData(data.invoice, data.items);
  const totals = computeTotals(invoiceData.items);
  const payHref = data.invoice.paymentUrl;
  const isPaid = data.invoice.status === "paid";

  return (
    <div className="min-h-screen bg-cloud">
      <header className="border-b border-hairline bg-paper">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Logo className="h-8" />
          <span className="text-sm text-body">Invoice {data.invoice.number}</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* Status bar — thank-you when paid, pay-now otherwise */}
        {isPaid ? (
          <div className="mb-5 flex flex-col items-center gap-2 rounded-card border border-emerald-500/30 bg-emerald-500/[0.06] p-6 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-7" />
            </div>
            <h2 className="font-display text-xl font-bold text-ink">Thank you — payment received</h2>
            <p className="text-sm text-body">
              {formatMoney(totals.total, invoiceData.currency)} for invoice {data.invoice.number} has been paid in full.
            </p>
          </div>
        ) : (
          <div className="mb-5 flex flex-col items-start justify-between gap-3 rounded-card border border-hairline bg-paper p-5 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm text-body">Amount due</p>
              <p className="font-display text-2xl font-bold text-ink">{formatMoney(totals.total, invoiceData.currency)}</p>
            </div>
            {payHref && (
              <a
                href={payHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
              >
                <CreditCard className="size-4" /> Pay this invoice
              </a>
            )}
          </div>
        )}

        <InvoicePreview data={invoiceData} issuer={issuer} />

        <p className="mt-6 text-center text-xs text-muted">
          Powered by Litch Consulting · Questions? Reply to the email this invoice came from.
        </p>
      </main>
    </div>
  );
}
