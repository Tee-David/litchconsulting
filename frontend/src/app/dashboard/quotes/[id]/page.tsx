import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { StatusChip } from "@/components/kit";
import { PageHead, Panel, KV, Callout, linkBtn } from "@/components/dashboard/ui";
import { QuoteDecision } from "@/components/dashboard/quote-decision";
import { InvoicePreview } from "@/components/admin/invoice/invoice-preview";
import { getPortal } from "@/lib/requests/portal";
import { loadClientQuote, quoteExpired, requestForQuote } from "@/lib/requests/quote";
import { getClientInvoice } from "@/lib/db/queries/invoices";
import { getIssuer } from "@/lib/invoice/get-issuer";
import { toInvoiceData } from "@/lib/invoice/map";
import { formatMoney } from "@/lib/invoice/money";
import { formatDate } from "@/lib/format-date";
import { db } from "@/lib/db/client";
import { invoice } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Quote" };
export const dynamic = "force-dynamic";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const portal = await getPortal();
  if (!portal) redirect("/login?redirect=/dashboard/billing");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const q = await loadClientQuote(id, portal.client.id);
  if (!q) notFound();
  const [data, issuer, req] = await Promise.all([getClientInvoice(q.id, portal.client.id), getIssuer(), requestForQuote(q.id)]);
  if (!data) notFound();

  // The invoice made on acceptance carries "From quote <number>." in its notes
  // (acceptQuote writes it); find it for the "Pay now" link.
  let madeInvoice: { id: string; number: string; status: string } | null = null;
  if (q.status === "accepted") {
    const mine = await db
      .select({ id: invoice.id, number: invoice.number, status: invoice.status, notes: invoice.notes })
      .from(invoice)
      .where(and(eq(invoice.clientId, portal.client.id), eq(invoice.kind, "invoice"), isNull(invoice.deletedAt)));
    madeInvoice = mine.find((x) => x.notes?.includes(`From quote ${q.number}.`)) ?? null;
  }

  const total = Number(q.total);
  const deposit = q.depositPercent ? Math.round(total * q.depositPercent) / 100 : null;
  const expired = quoteExpired(q);
  const open = ["sent", "viewed"].includes(q.status) && !expired;
  const askHref = req ? `/dashboard/requests/${req.id}?tab=messages` : `/dashboard/support?new=true`;

  return (
    <div>
      <PageHead
        crumbs={[{ href: "/dashboard/billing", label: "Billing" }, { label: q.number }]}
        title={`${q.projectTitle || "Your"} quote`}
        chip={<StatusChip domain="quote" status={expired && open ? "expired" : q.status} audience="client" />}
        lede={`${q.number} from Litch Consulting${q.dueDate ? ` · valid to ${formatDate(q.dueDate)}` : ""}${req ? ` · for ${req.number}` : ""}`}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 overflow-x-auto rounded-card border border-hairline bg-paper p-2 sm:p-4">
          <InvoicePreview data={toInvoiceData(data.invoice, data.items)} issuer={issuer} variant="quote" />
        </div>
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Panel>
            <KV
              rows={[
                ["Fee", formatMoney(Number(q.subtotal), q.currency)],
                ["VAT and taxes", formatMoney(Number(q.taxTotal), q.currency)],
                [<b key="t" className="text-ink">Total</b>, <b key="v" className="font-display text-lg text-ink">{formatMoney(total, q.currency)}</b>],
              ]}
            />
            <div className="mt-4">
              {open ? (
                <QuoteDecision
                  quoteId={q.id}
                  total={formatMoney(total, q.currency)}
                  deposit={deposit !== null ? formatMoney(deposit, q.currency) : null}
                  depositPercent={q.depositPercent}
                  askHref={askHref}
                />
              ) : q.status === "accepted" ? (
                <div className="space-y-3">
                  <Callout tone="good" title="Accepted">
                    {madeInvoice ? `Invoice ${madeInvoice.number} was created.` : "Your invoice is in Billing."}
                  </Callout>
                  {madeInvoice && ["sent", "overdue", "partially_paid"].includes(madeInvoice.status) ? (
                    <Link className={`${linkBtn.primary} w-full`} href={`/dashboard/billing/pay?invoice=${madeInvoice.id}`}>Pay now</Link>
                  ) : (
                    <Link className={`${linkBtn.secondary} w-full`} href="/dashboard/billing">Go to Billing</Link>
                  )}
                </div>
              ) : q.status === "declined" ? (
                <Callout tone="info" title="You declined this quote">If you change your mind, ask us for a fresh quote from Support.</Callout>
              ) : expired ? (
                <Callout tone="warn" title="This quote has expired" action={<Link className={linkBtn.small} href={askHref}>Ask for a new one</Link>}>
                  Prices may have changed. We will refresh it within a working day.
                </Callout>
              ) : (
                <p className="text-sm text-body">This quote is not open for a decision.</p>
              )}
            </div>
          </Panel>
          <a href={`/api/dashboard/invoices/${q.id}/pdf`} className={`${linkBtn.secondary} w-full`}>
            Download PDF
          </a>
        </aside>
      </div>
    </div>
  );
}
