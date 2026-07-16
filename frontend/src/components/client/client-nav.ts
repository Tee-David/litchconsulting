import type { LucideIcon } from "lucide-react";
import {
  LayoutGrid,
  Briefcase,
  Wallet,
  FileStack,
  LifeBuoy,
  Settings,
} from "lucide-react";

export type ClientNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  group: "main" | "general";
};

export const CLIENT_NAV_ITEMS: ClientNavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutGrid, group: "main" },
  { label: "My Services", href: "/dashboard/requests", icon: Briefcase, group: "main" },
  { label: "Billing", href: "/dashboard/invoices", icon: Wallet, group: "main" },
  { label: "Templates", href: "/dashboard/templates", icon: FileStack, group: "main" },
  { label: "Support Desk", href: "/dashboard/support", icon: LifeBuoy, group: "general" },
  { label: "Profile Settings", href: "/dashboard/settings", icon: Settings, group: "general" },
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
