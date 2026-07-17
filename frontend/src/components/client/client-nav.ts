import type { LucideIcon } from "lucide-react";
import {
  LayoutGrid,
  Briefcase,
  Wallet,
  LifeBuoy,
  Settings,
} from "lucide-react";

export type ClientNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  group: "main" | "general";
  /** Stable key for `data-tour="nav-<tourKey>"` anchors used by the guided tour. */
  tourKey: string;
};

export const CLIENT_NAV_ITEMS: ClientNavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutGrid, group: "main", tourKey: "dashboard" },
  { label: "My Services", href: "/dashboard/requests", icon: Briefcase, group: "main", tourKey: "my-services" },
  { label: "Billing", href: "/dashboard/invoices", icon: Wallet, group: "main", tourKey: "billing" },
  { label: "Support Desk", href: "/dashboard/support", icon: LifeBuoy, group: "general", tourKey: "support" },
  { label: "Profile Settings", href: "/dashboard/settings", icon: Settings, group: "general", tourKey: "settings" },
];

/** Whether a nav item is active for the given pathname. */
export function isClientNavActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Best-matching nav item for a pathname (for the topbar title). */
export function activeClientNavItem(pathname: string): ClientNavItem | undefined {
  return (
    [...CLIENT_NAV_ITEMS]
      .sort((a, b) => b.href.length - a.href.length)
      .find((i) => isClientNavActive(i.href, pathname))
  );
}
