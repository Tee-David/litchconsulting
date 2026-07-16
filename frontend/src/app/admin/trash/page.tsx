import { Trash2 } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { listTrashedClients } from "@/lib/db/queries/clients";
import { TrashList } from "./trash-list";

export const dynamic = "force-dynamic";

/**
 * Trash — soft-deleted records, restorable for 30 days before the sweep cron
 * purges them for good. Nothing here is visible anywhere else in the app.
 */
export default async function TrashPage() {
  const clients = await listTrashedClients();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trash"
        description="Deleted records stay here for 30 days — restore anything, or remove it permanently."
      />

      {clients.length === 0 ? (
        <div className="rounded-card border border-hairline bg-paper p-10">
          <EmptyState
            icon={Trash2}
            title="Trash is empty"
            description="Deleted clients appear here for 30 days so a mistake is never final."
          />
        </div>
      ) : (
        <TrashList
          clients={clients.map((c) => ({
            id: c.id,
            name: c.company || c.name,
            email: c.email,
            deletedAt: (c.deletedAt as Date).toISOString(),
          }))}
        />
      )}
    </div>
  );
}
