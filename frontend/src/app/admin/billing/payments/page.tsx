import { requireArea } from "@/lib/server-user";
import { PageHead } from "@/components/admin/ui/surface";
import { BillingTabs } from "@/components/admin/billing/billing-tabs";
import { PaymentsTable } from "@/components/admin/billing/payments-table";
import { listBillingDocs, listPaymentLines } from "../../_lib/billing-data";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  await requireArea("billing", "/admin/billing/payments");
  const [lines, docs] = await Promise.all([listPaymentLines(), listBillingDocs()]);
  const openInvoices = docs
    .filter((d) => d.kind === "invoice" && ["sent", "viewed", "overdue", "partially_paid"].includes(d.status) && d.balance > 0)
    .map((d) => ({ id: d.id, number: d.number, client: d.client, balance: d.balance, currency: d.currency }));
  const toConfirm = lines.filter((l) => l.status === "proof").length;

  return (
    <div>
      <PageHead title="Payments" lede="Everything that came in, how it came, and whether it is matched to an invoice." />
      <BillingTabs active="payments" toConfirm={toConfirm} />
      <PaymentsTable lines={lines} openInvoices={openInvoices} />
    </div>
  );
}
