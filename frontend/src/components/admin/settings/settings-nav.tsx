"use client";

import { usePathname } from "next/navigation";
import { LinkTabs } from "@/components/admin/ui/surface";

const TABS = [
  { id: "/admin/settings", label: "Firm and users", href: "/admin/settings" },
  { id: "/admin/settings/access", label: "Team and access", href: "/admin/settings/access" },
  { id: "/admin/notifications", label: "Notifications", href: "/admin/notifications#prefs" },
  { id: "/admin/settings/backups", label: "Backups", href: "/admin/settings/backups" },
  { id: "/admin/settings/integrations", label: "Integrations", href: "/admin/settings/integrations" },
];

export function SettingsNav() {
  const pathname = usePathname() ?? "/admin/settings";
  const active = [...TABS].sort((a, b) => b.id.length - a.id.length).find((t) => pathname === t.id || pathname.startsWith(t.id + "/"))?.id ?? "/admin/settings";
  return <LinkTabs label="Settings sections" active={active} tabs={TABS} />;
}
