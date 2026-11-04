import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHead, Panel, KV } from "@/components/dashboard/ui";
import { BillingTable, type BillingRow } from "@/components/dashboard/billing-table";
import { getPortal, clientBilling } from "@/lib/requests/portal";
import { formatMoney } from "@/lib/invoice/money";
import { balanceOf, depositOf, isPayable } from "@/lib/payments/amounts";
import { quoteExpired } from "@/lib/requests/quote";
import { formatDate } from "@/lib/format-date";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const portal = await getPortal();
  if (!portal) redirect("/login?redirect=/dashboard/billing");
  const b = await clientBilling(portal.client.id);
  const year = new Date().getFullYear();

  const rows: BillingRow[] = [
    ...b.quotes.map((q) => {
      const open = ["sent", "viewed"].includes(q.status) && !quoteExpired(q);
      return {
        id: q.id,
        kind: "quote" as const,
        number: q.number,
        title: q.projectTitle || "Quote",
        status: !open && ["sent", "viewed"].includes(q.status) ? "expired" : q.status,
        total: formatMoney(Number(q.total), q.currency),
        due: q.dueDate ? formatDate(q.dueDate) : "",
        issued: formatDate(q.issueDate),
        requestNumber: b.requestByInvoice.get(q.id)?.number ?? null,
        action: open ? { label: "Review", href: `/dashboard/quotes/${q.id}` } : null,
        owing: open,
      };
    }),
    ...b.invoices.map((i) => {
      const payable = isPayable(i) && !b.pendingTransfers.has(i.id);
      const dep = depositOf(i);
      return {
        id: i.id,
        kind: "invoice" as const,
        number: i.number,
        title: i.projectTitle || "Invoice",
        status: b.pendingTransfers.has(i.id) ? "sent" : i.status,
        total: formatMoney(Number(i.total), i.currency),
        due: b.pendingTransfers.has(i.id) ? "Checking your transfer" : i.dueDate ? formatDate(i.dueDate) : "",
        issued: formatDate(i.issueDate),
        requestNumber: b.requestByInvoice.get(i.id)?.number ?? null,
        action: payable ? { label: dep !== null ? "Pay deposit" : i.status === "partially_paid" ? "Pay balance" : "Pay", href: `/dashboard/billing/pay?invoice=${i.id}` } : null,
        owing: payable,
      };
    }),
  ];

  const paid = b.invoices.filter((i) => (i.paidAt ?? i.updatedAt).getFullYear() === year).reduce((s, i) => s + Number(i.amountPaid ?? 0), 0);
  const owed = b.invoices.filter((i) => isPayable(i)).reduce((s, i) => s + balanceOf(i), 0);

  return (
    <div>
      <PageHead title="Billing" lede="Quotes to answer, invoices to pay, and receipts for everything paid." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <BillingTable rows={rows} />
        </div>
        <aside>
          <Panel title="Summary">
            <KV
              rows={[
                [`Paid in ${year}`, formatMoney(paid)],
                ["Outstanding", formatMoney(owed)],
                ["Transfers we are checking", String(b.pendingTransfers.size)],
              ]}
            />
          </Panel>
        </aside>
      </div>
    </div>
  );
}
