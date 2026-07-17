import type { LucideIcon } from "lucide-react";
import {
  LayoutGrid,
  Inbox,
  Users,
  BarChart3,
  Wallet,
  FileStack,
  PenSquare,
  Settings,
  Cable,
  LifeBuoy,
  Bot,
  Sparkles,
  ScrollText,
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
  /** Stable key for `data-tour="nav-<tourKey>"` anchors used by the guided tour. */
  tourKey: string;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutGrid, group: "main", tourKey: "dashboard" },
  { label: "Requests", href: "/admin/requests", icon: Inbox, group: "main", tourKey: "requests" },
  { label: "Clients", href: "/admin/clients", icon: Users, group: "main", tourKey: "clients" },
  { label: "Reports", href: "/admin/reports", icon: BarChart3, group: "main", tourKey: "reports" },
  { label: "Finance", href: "/admin/finance", icon: Wallet, group: "main", tourKey: "finance" },
  { label: "Blog", href: "/admin/blog", icon: PenSquare, group: "main", tourKey: "blog" },
  { label: "Analyses", href: "/admin/analyses", icon: Bot, group: "main", tourKey: "litchai" },
  { label: "Sage", href: "/admin/sage", icon: Sparkles, group: "general", tourKey: "copilot" },
  { label: "Settings", href: "/admin/settings", icon: Settings, group: "general", tourKey: "settings" },
  { label: "Help Desk", href: "/admin/help-desk", icon: LifeBuoy, group: "general", tourKey: "help-desk" },
  { label: "Audit log", href: "/admin/audit", icon: ScrollText, group: "general", tourKey: "audit" },
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
