import { CalculatorsExplorer } from "@/components/calculators/calculators-explorer";

export default function CalculatorsPage() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-body">
        Nigerian finance calculators for the 2026 tax year — income tax &amp; take-home pay,
        pension, VAT, loans, mortgages and import duty.
      </p>
      <CalculatorsExplorer isAdmin />
    </div>
  );
}
