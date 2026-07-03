import Link from "next/link";
import { Users, Plus } from "lucide-react";
import { listClients } from "@/lib/db/queries/clients";
import { PageHeader } from "@/components/admin/ui/page-header";
import { EmptyState } from "@/components/admin/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = await listClients();

  return (
    <div className="space-y-6">
      <PageHeader title="Clients" description="Your bill-to directory. New clients added from the invoice builder appear here.">
        <Link
          href="/admin/finance/invoices/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          <Plus className="size-4" /> New invoice
        </Link>
      </PageHeader>

      {clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No clients yet"
          description="Clients are created automatically when you add a bill-to on an invoice. Full client profiles, documents and activity land here next."
        />
      ) : (
        <div className="overflow-x-auto rounded-card border border-hairline bg-paper">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Tax ID</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-hairline last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{c.company || c.name}</p>
                    {c.company && c.name && <p className="text-xs text-muted">{c.name}</p>}
                  </td>
                  <td className="px-4 py-3 text-body">{c.email || "—"}</td>
                  <td className="px-4 py-3 text-body">{c.phone || "—"}</td>
                  <td className="px-4 py-3 text-body">{c.taxId || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
