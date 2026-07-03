import { FileText } from "lucide-react";
import { EmptyState } from "@/components/admin/ui/empty-state";

export default function QuotesPage() {
  return (
    <EmptyState
      icon={FileText}
      title="Quotes are coming next"
      description="Draft branded quotes with the same builder as invoices, then convert an accepted quote into an invoice in one click."
    />
  );
}
