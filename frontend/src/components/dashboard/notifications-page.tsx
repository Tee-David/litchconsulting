import { CATEGORIES, getPrefs, listNotifications, type NotifyCategory } from "@/lib/notifications";
import { PageHead } from "./ui";
import { NotificationsCenter, type CenterPref } from "./notifications-center";

/** Server loader + page body for /dashboard/notifications and /work/notifications. */
export async function NotificationsPage({
  userId,
  audience,
  tab,
  weeklySummary,
}: {
  userId: string;
  audience: "client" | "staff";
  tab?: string;
  weeklySummary: boolean | null;
}) {
  const [rows, prefs] = await Promise.all([listNotifications(userId, { limit: 150 }), getPrefs(userId)]);
  // Clients never get team notices; staff never get billing amounts, but they
  // do get billing state changes (deposit paid → start work), so keep it.
  const hidden: NotifyCategory[] = audience === "client" ? ["team"] : [];
  const prefRows: CenterPref[] = prefs
    .filter((p) => !hidden.includes(p.category))
    .map((p) => ({
      ...p,
      label: CATEGORIES[p.category].label,
      hint: CATEGORIES[p.category].hint,
      lockOff: audience === "client" && p.category === "actions",
    }));
  return (
    <>
      <PageHead title="Notifications" lede={audience === "client" ? "Everything we told you, and how you want to hear it." : "Everything on your requests, and how you want to hear it."} />
      <NotificationsCenter
        tab={tab === "prefs" ? "prefs" : "list"}
        weeklySummary={weeklySummary}
        prefs={prefRows}
        items={rows.map((r) => ({
          id: r.id,
          category: r.category,
          title: r.title,
          body: r.body,
          link: r.link,
          read: Boolean(r.readAt),
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
