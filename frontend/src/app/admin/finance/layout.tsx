import { Tabs } from "@/components/admin/ui/tabs";

const FINANCE_TABS = [
  { label: "Invoices", href: "/admin/finance/invoices" },
  { label: "Quotes", href: "/admin/finance/quotes" },
  { label: "Payments", href: "/admin/finance/payments" },
  { label: "Receipts", href: "/admin/finance/receipts" },
  { label: "Accounting", href: "/admin/finance/accounting" },
  { label: "Models", href: "/admin/finance/tools" },
  { label: "Calculators", href: "/admin/finance/calculators" },
  { label: "Templates", href: "/admin/finance/templates" },
];

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div data-tour="finance-tabs">
        <h1 className="mb-4 font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">Finance</h1>
        <Tabs tabs={FINANCE_TABS} />
      </div>
      {children}
    </div>
  );
}
