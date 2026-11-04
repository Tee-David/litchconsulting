import { requireArea } from "@/lib/server-user";
import { CATEGORIES, getPrefs, listNotifications } from "@/lib/notifications";
import { PageHead } from "@/components/admin/ui/surface";
import { PushToggle } from "@/components/admin/push-toggle";
import { NotificationList, PrefsMatrix } from "@/components/admin/notifications-center";

export const dynamic = "force-dynamic";

/** Every notification for the signed-in admin, plus their per-category delivery preferences. */
export default async function NotificationsPage() {
  const me = await requireArea("home", "/admin/notifications");
  const [items, prefs] = await Promise.all([listNotifications(me.id, { limit: 200 }), getPrefs(me.id)]);
  const labels = Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, v.label]));

  return (
    <div className="space-y-5">
      <PageHead title="Notifications" lede="Everything the platform told you, newest first, and how you want to hear about each kind." actions={<PushToggle />} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <NotificationList
          labels={labels}
          items={items.map((n) => ({
            id: n.id,
            category: n.category,
            title: n.title,
            body: n.body,
            link: n.link,
            read: Boolean(n.readAt),
            createdAt: n.createdAt.toISOString(),
          }))}
        />
        <PrefsMatrix prefs={prefs.map((p) => ({ ...p, label: CATEGORIES[p.category].label, hint: CATEGORIES[p.category].hint }))} />
      </div>
    </div>
  );
}
