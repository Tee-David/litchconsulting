import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { StatusChip } from "@/components/kit";
import { PageHead, Panel, KV, Callout, linkBtn } from "@/components/dashboard/ui";
import { PayPanel } from "@/components/dashboard/pay-panel";
import { getPortal } from "@/lib/requests/portal";
import { db } from "@/lib/db/client";
import { invoice, serviceRequest } from "@/lib/db/schema";
import { getIssuer } from "@/lib/invoice/get-issuer";
import { formatMoney } from "@/lib/invoice/money";
import { balanceOf, isPayable, payOptions } from "@/lib/payments/amounts";
import { pendingTransfer } from "@/lib/payments/bank-transfer";
import { paystackConfigured } from "@/lib/paystack";
import { formatDate, formatDateTime } from "@/lib/format-date";

export const metadata: Metadata = { title: "Pay" };
export const dynamic = "force-dynamic";

export default async function PayPage({ searchParams }: { searchParams: Promise<{ invoice?: string }> }) {
  const portal = await getPortal();
  if (!portal) redirect("/login?redirect=/dashboard/billing");
  const { invoice: id } = await searchParams;
  if (!id) redirect("/dashboard/billing");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [inv] = await db
    .select()
    .from(invoice)
    .where(and(eq(invoice.id, id), eq(invoice.clientId, portal.client.id), eq(invoice.kind, "invoice"), isNull(invoice.deletedAt)));
  if (!inv) notFound();
  const [issuer, pending, req] = await Promise.all([
    getIssuer(),
    pendingTransfer(inv.id),
    db.select({ id: serviceRequest.id, number: serviceRequest.number }).from(serviceRequest).where(eq(serviceRequest.invoiceId, inv.id)).then((r) => r[0] ?? null),
  ]);
  const options = payOptions(inv);
  const bank = issuer.bank.accountNumber && issuer.bank.accountNumber !== "—" ? issuer.bank : null;
  const balance = balanceOf(inv);
  const back = req ? `/dashboard/requests/${req.id}` : "/dashboard";

  return (
    <div>
      <PageHead
        crumbs={[{ href: "/dashboard/billing", label: "Billing" }, { label: `Pay ${inv.number}` }]}
        title={inv.status === "paid" ? "Paid. Thank you." : options[0]?.id === "deposit" ? "Pay the deposit" : inv.status === "partially_paid" ? "Pay the balance" : `Pay ${inv.number}`}
        chip={<StatusChip domain="invoice" status={inv.status} audience="client" />}
        lede={`${inv.number}${inv.projectTitle ? ` · ${inv.projectTitle}` : ""} · ${inv.billToCompany || inv.billToName || portal.client.name}`}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <Panel>
            {inv.status === "paid" ? (
              <div className="space-y-4">
                <Callout tone="good" title="Payment received">
                  {formatMoney(Number(inv.total), inv.currency)} paid{inv.paidAt ? ` on ${formatDate(inv.paidAt)}` : ""}. Your receipt is here and in your email.
                </Callout>
                <div className="flex flex-wrap gap-2">
                  <a className={linkBtn.secondary} href={`/api/dashboard/invoices/${inv.id}/pdf?variant=receipt`}>Download receipt</a>
                  <Link className={linkBtn.primary} href={back}>{req ? "Back to the request" : "Back to Home"}</Link>
                </div>
              </div>
            ) : pending ? (
              <Callout tone="info" title="Receipt uploaded. We confirm within a working day.">
                {pending.proofFileName ?? "Your receipt"} · {formatMoney(Number(pending.amount), inv.currency)} · {formatDateTime(pending.createdAt)}. You get an email when it is confirmed; work starts then.
              </Callout>
            ) : !isPayable(inv) ? (
              <Callout tone="warn" title="This invoice is not open for payment">
                {inv.status === "void" ? "It was cancelled." : "Ask us through Support if you think this is wrong."}
              </Callout>
            ) : (
              <PayPanel
                invoiceId={inv.id}
                invoiceNumber={inv.number}
                cardAvailable={paystackConfigured() && inv.currency === "NGN"}
                bank={bank ? { name: bank.name, accountName: bank.accountName, accountNumber: bank.accountNumber } : null}
                options={options.map((o) => ({ id: o.id, label: o.label, hint: o.hint, amount: formatMoney(o.amount, inv.currency) }))}
              />
            )}
          </Panel>
        </div>
        <aside className="space-y-4">
          <Panel title={inv.number}>
            <KV
              rows={[
                ["Fee", formatMoney(Number(inv.subtotal), inv.currency)],
                ["VAT and taxes", formatMoney(Number(inv.taxTotal), inv.currency)],
                ["Total", formatMoney(Number(inv.total), inv.currency)],
                ...(Number(inv.amountPaid) > 0 ? ([["Paid so far", formatMoney(Number(inv.amountPaid), inv.currency)]] as Array<[string, string]>) : []),
                [<b key="b" className="text-ink">Due now</b>, <b key="v" className="text-ink">{formatMoney(options[0]?.amount ?? balance, inv.currency)}</b>],
              ]}
            />
            <Link className={`${linkBtn.ghost} mt-2`} href={`/dashboard/invoices/${inv.id}`}>See the invoice</Link>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
