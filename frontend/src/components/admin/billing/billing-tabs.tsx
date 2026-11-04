import { LinkTabs } from "@/components/admin/ui/surface";

/** Billing's four sections (replacing Finance's eight tabs). */
export function BillingTabs({ active, toConfirm }: { active: "docs" | "payments" | "expenses" | "tools"; toConfirm?: number }) {
  return (
    <div data-tour="finance-tabs">
      <LinkTabs
        label="Billing sections"
        active={active}
        tabs={[
          { id: "docs", label: "Quotes and invoices", href: "/admin/billing" },
          { id: "payments", label: "Payments", href: "/admin/billing/payments", count: toConfirm },
          { id: "expenses", label: "Expenses", href: "/admin/billing/expenses" },
          { id: "tools", label: "Tools", href: "/admin/billing/tools" },
        ]}
      />
    </div>
  );
}
