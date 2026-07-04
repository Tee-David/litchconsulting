import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server-user";
import { getClientForUser } from "@/lib/db/queries/clients";
import { listClientInvoices } from "@/lib/db/queries/invoices";
import { InvoicesClient } from "./invoices-client";

export const dynamic = "force-dynamic";

export default async function ClientInvoicesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?redirect=/dashboard/invoices");
  if (user.role === "admin") redirect("/admin");

  const clientRow = await getClientForUser(user.id, user.email || "", user.name || undefined);
  const invoices = await listClientInvoices(clientRow.id);

  return <InvoicesClient invoices={invoices} />;
}
