import { Receipt } from "lucide-react";
import { EmptyState } from "@/components/admin/ui/empty-state";

export default function ReceiptsPage() {
  return (
    <EmptyState
      icon={Receipt}
      title="Receipts are coming next"
      description="Automatically issue branded receipts when an invoice is marked paid, with the same Litch-styled PDF and email delivery."
    />
  );
}
