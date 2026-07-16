import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, Landmark, AlertTriangle } from "lucide-react";
import { getInvoiceByToken } from "@/lib/db/queries/invoices";
import { toInvoiceData } from "@/lib/invoice/map";
import { getIssuer } from "@/lib/invoice/get-issuer";
import { InvoicePreview } from "@/components/admin/invoice/invoice-preview";
import { Logo } from "@/components/ui/logo";
import { formatMoney, computeTotals } from "@/lib/invoice/money";
import { paystackConfigured } from "@/lib/paystack";
import { PayButton } from "@/components/pay/pay-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };

export default async function PublicInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string; payfail?: string; payflag?: string }>;
}) {
  const { token } = await params;
  const flags = await searchParams;
  const [data, issuer] = await Promise.all([getInvoiceByToken(token), getIssuer()]);
  if (!data) notFound();

  const invoiceData = toInvoiceData(data.invoice, data.items);
  const totals = computeTotals(invoiceData.items);
  const isPaid = data.invoice.status === "paid";
  const payable =
    data.invoice.kind === "invoice" && ["sent", "overdue"].includes(data.invoice.status);
  const canPayOnline = payable && paystackConfigured() && data.invoice.currency === "NGN";
  const hasBank = issuer.bank.accountNumber && issuer.bank.accountNumber !== "—";

  return (
    <div className="min-h-screen bg-cloud">
      <header className="border-b border-hairline bg-paper">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Logo className="h-8" />
          <span className="text-sm text-body">Invoice {data.invoice.number}</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {flags.payfail && !isPaid && (
          <div className="mb-5 flex items-center gap-3 rounded-card border border-amber-500/30 bg-amber-500/[0.06] p-4 text-sm text-body">
            <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
            Your payment didn&apos;t complete. No money left your account — you can try again below.
          </div>
        )}
        {flags.payflag && (
          <div className="mb-5 flex items-center gap-3 rounded-card border border-amber-500/30 bg-amber-500/[0.06] p-4 text-sm text-body">
            <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
            We received your payment but it needs a quick manual check. We&apos;ll confirm by email
            shortly — no further action needed.
          </div>
        )}

        {/* Status bar — thank-you when paid, payment options otherwise */}
        {isPaid ? (
          <div className="mb-5 flex flex-col items-center gap-2 rounded-card border border-emerald-500/30 bg-emerald-500/[0.06] p-6 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-7" />
            </div>
            <h2 className="font-display text-xl font-bold text-ink">Thank you — payment received</h2>
            <p className="text-sm text-body">
              {formatMoney(totals.total, invoiceData.currency)} for invoice {data.invoice.number} has
              been paid in full.
            </p>
          </div>
        ) : (
          <div className="mb-5 rounded-card border border-hairline bg-paper p-5">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm text-body">Amount due</p>
                <p className="font-display text-2xl font-bold text-ink">
                  {formatMoney(totals.total, invoiceData.currency)}
                </p>
              </div>
              {canPayOnline && <PayButton token={token} />}
            </div>
            {payable && hasBank && (
              <div className="mt-4 flex items-start gap-3 rounded-xl2 border border-hairline bg-surface p-4">
                <Landmark className="mt-0.5 size-5 shrink-0 text-brand" />
                <div className="text-sm">
                  <p className="font-semibold text-ink">
                    {canPayOnline ? "Prefer a bank transfer?" : "Pay by bank transfer"}
                  </p>
                  <p className="mt-1 text-body">
                    {issuer.bank.name} · {issuer.bank.accountName} ·{" "}
                    <span className="font-mono font-semibold text-ink">
                      {issuer.bank.accountNumber}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Use <span className="font-medium">{data.invoice.number}</span> as your transfer
                    reference so we can match your payment quickly.
                  </p>
                </div>
              </div>
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
