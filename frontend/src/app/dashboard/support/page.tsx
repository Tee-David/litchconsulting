import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server-user";
import { getClientForUser } from "@/lib/db/queries/clients";
import { listClientTickets } from "@/lib/db/queries/tickets";
import { SupportClient } from "./support-client";

export const dynamic = "force-dynamic";

export default async function ClientSupportPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?redirect=/dashboard/support");
  if (user.role === "admin") redirect("/admin");

  const clientRow = await getClientForUser(user.id, user.email || "", user.name || undefined);
  const tickets = await listClientTickets(clientRow.id);

  return <SupportClient tickets={tickets} />;
}
