import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server-user";
import { listTemplates } from "@/lib/db/queries/templates";
import { TemplatesClient } from "./templates-client";

export const dynamic = "force-dynamic";

export default async function ClientTemplatesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?redirect=/dashboard/templates");
  if (user.role === "admin") redirect("/admin");

  // Fetch all templates (they are public/shared resources for all authenticated clients)
  const templates = await listTemplates();

  return <TemplatesClient templates={templates} />;
}
