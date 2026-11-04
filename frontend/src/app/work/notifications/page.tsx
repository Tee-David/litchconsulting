import type { Metadata } from "next";
import { requireArea } from "@/lib/server-user";
import { NotificationsPage } from "@/components/dashboard/notifications-page";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function WorkNotificationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireArea("home", "/work/notifications");
  const { tab } = await searchParams;
  return <NotificationsPage userId={user.id} audience="staff" tab={tab} weeklySummary={null} />;
}
