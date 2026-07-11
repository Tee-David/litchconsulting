import Link from "next/link";
import { Users } from "lucide-react";
import { listClients } from "@/lib/db/queries/clients";
import { PageHeader } from "@/components/admin/ui/page-header";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { NewClientButton } from "@/components/admin/client/new-client-button";
import { ClientList } from "@/components/admin/client/client-list";

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
        <ClientList clients={clients} />
      )}
    </div>
  );
}
