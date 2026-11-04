import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortal, clientRequestRows } from "@/lib/requests/portal";
import { listClientTickets } from "@/lib/db/queries/tickets";
import { SupportClient } from "./support-client";

export const metadata: Metadata = { title: "Support" };
export const dynamic = "force-dynamic";

export default async function ClientSupportPage() {
  const portal = await getPortal();
  if (!portal) redirect("/login?redirect=/dashboard/support");
  const [tickets, requests] = await Promise.all([listClientTickets(portal.client.id), clientRequestRows(portal.client.id)]);
  return (
    <SupportClient
      tickets={tickets.filter((t) => !t.deletedAt)}
      requests={requests.map((r) => ({ id: r.id, number: r.number, serviceName: r.serviceName }))}
    />
  );
}
