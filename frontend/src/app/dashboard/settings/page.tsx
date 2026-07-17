import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server-user";
import { getClientForUser } from "@/lib/db/queries/clients";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function ClientSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?redirect=/dashboard/settings");
  if (user.role === "admin") redirect("/admin");

  const clientRow = await getClientForUser(user.id, user.email || "", user.name || undefined);

  const initialData = {
    name: clientRow.name,
    company: clientRow.company,
    phone: clientRow.phone,
    address: clientRow.address,
    taxId: clientRow.taxId,
    email: user.email || "",
    digestOptOut: clientRow.digestOptOut,
  };

  return <SettingsForm initialData={initialData} />;
}
