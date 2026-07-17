import { Receipt } from "lucide-react";
import { listInvoices } from "@/lib/db/queries/invoices";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { ReceiptsList } from "@/components/admin/finance/receipts-list";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage() {
  const paid = (await listInvoices()).filter((i) => i.status === "paid");

  if (paid.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="No receipts yet"
        description="A receipt is generated for every invoice you mark as paid. Mark an invoice paid to see its branded receipt here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-body">Branded receipts for paid invoices.</p>
      <ReceiptsList paid={paid} />
    </div>
  );
}
