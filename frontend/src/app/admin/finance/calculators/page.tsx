import { CalculatorsView } from "@/components/admin/finance/calculators-view";

export default function CalculatorsPage() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-body">Quick financial calculators for VAT, loan repayments and savings goals.</p>
      <CalculatorsView />
    </div>
  );
}
