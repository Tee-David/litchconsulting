import type { LucideIcon } from "lucide-react";
import {
  LayoutGrid,
  Users,
  BarChart3,
  Wallet,
  FileStack,
  PenSquare,
  Settings,
  Cable,
  LifeBuoy,
} from "lucide-react";

/**
 * Single source of truth for the admin sidebar (lean 5 + 3). Sidebar, topbar
 * breadcrumb and mobile drawer all read from this.
 */
export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  group: "main" | "general";
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutGrid, group: "main" },
  { label: "Clients", href: "/admin/clients", icon: Users, group: "main" },
  { label: "Reports", href: "/admin/reports", icon: BarChart3, group: "main" },
  { label: "Finance", href: "/admin/finance", icon: Wallet, group: "main" },
  { label: "Blog", href: "/admin/blog", icon: PenSquare, group: "main" },
  { label: "Templates", href: "/admin/templates", icon: FileStack, group: "main" },
  { label: "Settings", href: "/admin/settings", icon: Settings, group: "general" },
  { label: "Integrations", href: "/admin/integrations", icon: Cable, group: "general" },
  { label: "Help Desk", href: "/admin/help-desk", icon: LifeBuoy, group: "general" },
];

/** Whether a nav item is active for the given pathname. */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Best-matching nav item for a pathname (for the topbar title). */
export function activeNavItem(pathname: string): NavItem | undefined {
  return (
    [...NAV_ITEMS]
      .sort((a, b) => b.href.length - a.href.length)
      .find((i) => isNavActive(i.href, pathname))
  );
}
