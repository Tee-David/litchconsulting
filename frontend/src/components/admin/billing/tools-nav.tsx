import Link from "next/link";
import { PageHead } from "@/components/admin/ui/surface";
import { BillingTabs } from "./billing-tabs";
import { cn } from "@/lib/utils";

/** Billing → Tools: financial models, Nigerian tax calculators, templates. */
export function ToolsHead({ active }: { active: "models" | "calculators" | "templates" }) {
  const items = [
    { id: "models", label: "Financial models", href: "/admin/billing/tools" },
    { id: "calculators", label: "Calculators", href: "/admin/billing/calculators" },
    { id: "templates", label: "Templates", href: "/admin/billing/templates" },
  ] as const;
  return (
    <>
      <PageHead title="Tools" lede="Models, Nigerian tax calculators and branded templates for client work." />
      <BillingTabs active="tools" />
      <nav aria-label="Tools" className="mb-5 flex flex-wrap gap-1.5">
        {items.map((i) => (
          <Link
            key={i.id}
            href={i.href}
            aria-current={i.id === active ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium",
              i.id === active ? "keep-brand border-transparent bg-act text-act-ink" : "border-hairline text-body hover:text-ink",
            )}
          >
            {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
