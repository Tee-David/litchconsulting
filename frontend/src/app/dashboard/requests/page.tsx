import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHead, linkBtn } from "@/components/dashboard/ui";
import { ClientRequestsTable } from "@/components/dashboard/client-requests-table";
import { getPortal, clientRequestRows } from "@/lib/requests/portal";

export const metadata: Metadata = { title: "Requests" };
export const dynamic = "force-dynamic";

const CLIENT_MOVE = ["quote_sent", "pending_payment", "awaiting_documents", "client_review", "delivered"];

export default async function ClientRequestsPage() {
  const portal = await getPortal();
  if (!portal) redirect("/login?redirect=/dashboard/requests");
  const rows = await clientRequestRows(portal.client.id);
  const numberOf = new Map(rows.map((r) => [r.id, r.number]));
  return (
    <>
      <PageHead
        title="Requests"
        lede="Every piece of work you asked us for, and whose move it is."
        actions={
          <Link href="/dashboard/requests/new" className={linkBtn.primary}>
            <Plus className="size-4" aria-hidden /> Request a service
          </Link>
        }
      />
      <ClientRequestsTable
        rows={rows.map((r) => ({
          id: r.id,
          number: r.number,
          serviceName: r.serviceName,
          status: r.status,
          team: r.team.map((t) => t.name).join(", "),
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
          parentNumber: r.parentRequestId ? numberOf.get(r.parentRequestId) ?? null : null,
          yourMove: CLIENT_MOVE.includes(r.status),
        }))}
      />
    </>
  );
}
