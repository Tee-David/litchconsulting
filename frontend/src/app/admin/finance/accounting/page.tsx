import { BookOpen } from "lucide-react";
import { EmptyState } from "@/components/admin/ui/empty-state";

export default function AccountingPage() {
  return (
    <EmptyState
      icon={BookOpen}
      title="Accounting is coming next"
      description="A lightweight ledger — income, expenses and a running P&L — feeding straight into your reports and exports."
    />
  );
}
