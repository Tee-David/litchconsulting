import { listExpenses } from "@/lib/db/queries/expenses";
import { listInvoices } from "@/lib/db/queries/invoices";
import { AccountingView } from "@/components/admin/finance/accounting-view";

export const dynamic = "force-dynamic";

export default async function AccountingPage() {
  const [expenses, invoices] = await Promise.all([listExpenses(), listInvoices()]);
  return (
    <div className="space-y-4">
      <p className="text-sm text-body">
        A lightweight profit &amp; loss — revenue is drawn from collected invoices, and expenses you log below net off against it.
      </p>
      <AccountingView expenses={expenses} invoices={invoices} />
    </div>
  );
}
