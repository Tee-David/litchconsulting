import { listExpenses } from "@/lib/db/queries/expenses";
import { listInvoices } from "@/lib/db/queries/invoices";
import { AccountingView } from "@/components/admin/finance/accounting-view";
import { PageHead } from "@/components/admin/ui/surface";
import { BillingTabs } from "@/components/admin/billing/billing-tabs";
import { requireArea } from "@/lib/server-user";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  await requireArea("billing", "/admin/billing/expenses");
  const [expenses, invoices] = await Promise.all([listExpenses(), listInvoices()]);
  return (
    <div>
      <PageHead
        title="Expenses"
        lede="What the firm spent, by category, netted against money collected for a running profit and loss."
      />
      <BillingTabs active="expenses" />
      <AccountingView expenses={expenses} invoices={invoices} />
    </div>
  );
}
