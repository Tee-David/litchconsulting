import { Plus, Wallet } from "lucide-react";
import { requireArea } from "@/lib/server-user";
import { formatMoney } from "@/lib/invoice/money";
import { ActLink, Kpi, PageHead } from "@/components/admin/ui/surface";
import { BillingTabs } from "@/components/admin/billing/billing-tabs";
import { BillingTable } from "@/components/admin/billing/billing-table";
import { JobChain } from "@/components/admin/billing/job-chain";
import { listBillingDocs, proofCount } from "../_lib/billing-data";

export const dynamic = "force-dynamic";

function short(n: number) {
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(2)}m`;
  if (n >= 1e3) return `₦${Math.round(n / 1e3)}k`;
  return formatMoney(n);
}

export default async function BillingPage() {
  await requireArea("billing", "/admin/billing");
  const [docs, toConfirm] = await Promise.all([listBillingDocs(), proofCount()]);

  const quotes = docs.filter((d) => d.kind === "quote" && d.status === "sent");
  const unpaid = docs.filter((d) => d.kind === "invoice" && ["sent", "viewed", "overdue", "partially_paid"].includes(d.status));
  const late = unpaid.filter((d) => d.status === "overdue");
  const part = docs.filter((d) => d.status === "partially_paid");
  const sum = (xs: typeof docs, f: (d: (typeof docs)[number]) => number) => xs.reduce((s, d) => s + f(d), 0);

  return (
    <div>
      <PageHead
        title="Billing"
        lede="Quotes, invoices and receipts in one list. A quote becomes an invoice when the client accepts it."
        actions={
          <>
            <ActLink href="/admin/billing/payments" variant="secondary">
              <Wallet /> Record a payment
            </ActLink>
            <ActLink href="/admin/billing/invoices/new" variant="secondary">
              <Plus /> New invoice
            </ActLink>
            <ActLink href="/admin/billing/quotes/new">
              <Plus /> New quote
            </ActLink>
          </>
        }
      />
      <BillingTabs active="docs" toConfirm={toConfirm} />
      <div data-tour="invoice-stats" className="mb-5 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Quotes waiting" value={short(sum(quotes, (d) => d.total))} note={`${quotes.length} sent, not yet answered`} href="/admin/billing?view=quotes" />
        <Kpi label="Unpaid invoices" value={short(sum(unpaid, (d) => d.balance))} note={`${unpaid.length} invoices`} href="/admin/billing?view=unpaid" />
        <Kpi
          label="Late"
          value={short(sum(late, (d) => d.balance))}
          note={late.length ? `${late.length} past due` : "Nothing late"}
          noteTone={late.length ? "bad" : "good"}
          href="/admin/billing?view=late"
        />
        <Kpi label="Part paid, balance due" value={short(sum(part, (d) => d.balance))} note={`${part.length} invoices`} href="/admin/billing?view=part" />
      </div>
      <JobChain docs={docs} />
      <BillingTable docs={docs} />
    </div>
  );
}
