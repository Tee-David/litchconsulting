import { Calculator } from "lucide-react";
import { EmptyState } from "@/components/admin/ui/empty-state";

export default function CalculatorsPage() {
  return (
    <EmptyState
      icon={Calculator}
      title="Financial calculators are coming next"
      description="Tax, VAT, loan and budgeting calculators your team (and clients) can use — matching the public-site tools."
    />
  );
}
