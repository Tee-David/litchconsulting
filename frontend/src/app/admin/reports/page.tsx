import { listInvoices } from "@/lib/db/queries/invoices";
import { PageHeader } from "@/components/admin/ui/page-header";
import { ReportsView } from "@/components/admin/reports-view";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const invoices = await listInvoices();
  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Revenue, collection and client analytics across your practice." />
      <ReportsView invoices={invoices} />
    </div>
  );
}
