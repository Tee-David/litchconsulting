import { CalculatorsExplorer } from "@/components/calculators/calculators-explorer";
import { ToolsHead } from "@/components/admin/billing/tools-nav";

export default function CalculatorsPage() {
  return (
    <div>
      <ToolsHead active="calculators" />
      <p className="mb-4 text-sm text-body">
        Nigerian finance calculators for the 2026 tax year: income tax and take-home pay, pension, VAT, WHT, loans, mortgages and import duty.
      </p>
      <CalculatorsExplorer isAdmin />
    </div>
  );
}
