import Link from "next/link";
import { Users } from "lucide-react";
import { listClients } from "@/lib/db/queries/clients";
import { PageHeader } from "@/components/admin/ui/page-header";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { NewClientButton } from "@/components/admin/client/new-client-button";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = await listClients();

  return (
    <div className="space-y-6">
      <PageHeader title="Clients" description="Your client directory — add new clients and bill them on invoices.">
        <NewClientButton />
      </PageHeader>

      {clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No clients yet"
          description="Add your first client with the New client button. Clients you bill on invoices also appear here automatically."
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
                <tr key={c.id} className="border-b border-hairline last:border-0 transition-colors hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link href={`/admin/clients/${c.id}`} className="font-semibold text-ink hover:text-brand">
                      {c.company || c.name}
                    </Link>
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
