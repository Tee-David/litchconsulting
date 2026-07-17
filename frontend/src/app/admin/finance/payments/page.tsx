import { listPayments } from "@/lib/db/queries/payments";
import { PaymentsList } from "@/components/admin/finance/payments-list";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const payments = await listPayments();
  return (
    <div className="space-y-4">
      <p className="text-sm text-body">
        Every payment attempt against an invoice — search by client name, reference or invoice number to reconcile.
      </p>
      <PaymentsList payments={payments} />
    </div>
  );
}
