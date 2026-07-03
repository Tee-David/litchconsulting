import Link from "next/link";
import { Receipt, Download } from "lucide-react";
import { listInvoices } from "@/lib/db/queries/invoices";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { formatMoney, num } from "@/lib/invoice/money";

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
      <div className="overflow-x-auto rounded-card border border-hairline bg-paper">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Receipt</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3 text-right">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {paid.map((inv) => (
              <tr key={inv.id} className="border-b border-hairline last:border-0">
                <td className="px-4 py-3 font-semibold text-ink">{inv.number}</td>
                <td className="px-4 py-3 text-body">{inv.billToCompany || inv.billToName || "—"}</td>
                <td className="px-4 py-3 tabular-nums text-ink">{formatMoney(num(inv.total), inv.currency)}</td>
                <td className="px-4 py-3 text-body">
                  {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : inv.issueDate}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/api/admin/receipts/${inv.id}/pdf`}
                    target="_blank"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-paper px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-surface"
                  >
                    <Download className="size-4" /> Download
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
