import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortal } from "@/lib/requests/portal";
import { NotificationsPage } from "@/components/dashboard/notifications-page";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function ClientNotificationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const portal = await getPortal();
  if (!portal) redirect("/login?redirect=/dashboard/notifications");
  const { tab } = await searchParams;
  return <NotificationsPage userId={portal.user.id} audience="client" tab={tab} weeklySummary={!portal.client.digestOptOut} />;
}
