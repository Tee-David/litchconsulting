import { requireArea } from "@/lib/server-user";
import { PageHead } from "@/components/admin/ui/surface";
import { NewClientButton } from "@/components/admin/client/new-client-button";
import { ClientTable } from "@/components/admin/client/client-table";
import { listClientRows } from "../_lib/clients-data";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  await requireArea("clients", "/admin/clients");
  const rows = await listClientRows();
  return (
    <div>
      <PageHead
        title="Clients"
        lede="Every company we work for, with what they owe and how their data is handled."
        actions={
          <div data-tour="new-client">
            <NewClientButton />
          </div>
        }
      />
      <ClientTable rows={rows} />
    </div>
  );
}
