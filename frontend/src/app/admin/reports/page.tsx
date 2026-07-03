import { BarChart3 } from "lucide-react";
import { listInvoices } from "@/lib/db/queries/invoices";
import { PageHeader } from "@/components/admin/ui/page-header";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { ReportsExport } from "@/components/admin/reports-export";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const invoices = await listInvoices();
  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Analytics and exports across your practice. More report types land here next.">
        <ReportsExport invoices={invoices} />
      </PageHeader>
      <EmptyState
        icon={BarChart3}
        title="Rich reporting is on the way"
        description="Revenue, ageing, tax and client reports with date-range filters. For now you can export the full invoice dataset to CSV, Excel or PDF from the button above."
      />
    </div>
  );
}
