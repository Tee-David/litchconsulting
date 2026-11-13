/**
 * Navigation for the two non-admin shells. Each item carries a stable
 * `tour` key, rendered as `data-tour="nav-<tour>"` on the sidebar link and
 * `data-tour="tab-<tour>"` on the phone bottom bar, for guided tours.
 */

export type ShellKind = "staff" | "client";
export type NavIcon = "home" | "inbox" | "wallet" | "folder" | "help" | "bell" | "settings" | "table" | "msg" | "sage";

export type NavItem = {
  label: string;
  href: string;
  icon: NavIcon;
  tour: string;
  group: "main" | "general";
  /** Shown in the phone bottom bar (max 5 per shell). */
  bottom?: boolean;
  /** Key into the counts passed by the layout. */
  count?: "attention" | "billing" | "threads" | "unread";
};

export const NAV: Record<ShellKind, NavItem[]> = {
  staff: [
    { label: "My work", href: "/work", icon: "home", tour: "home", group: "main", bottom: true, count: "attention" },
    { label: "My requests", href: "/work/requests", icon: "inbox", tour: "requests", group: "main", bottom: true },
    { label: "Files", href: "/work/analyses", icon: "table", tour: "analyses", group: "main", bottom: true },
    { label: "Conversations", href: "/work/conversations", icon: "msg", tour: "conversations", group: "main", bottom: true, count: "threads" },
    { label: "Sage", href: "/work/sage", icon: "sage", tour: "sage", group: "main" },
    { label: "Notifications", href: "/work/notifications", icon: "bell", tour: "notifications", group: "general", bottom: true, count: "unread" },
  ],
  client: [
    { label: "Home", href: "/dashboard", icon: "home", tour: "home", group: "main", bottom: true, count: "attention" },
    { label: "Requests", href: "/dashboard/requests", icon: "inbox", tour: "requests", group: "main", bottom: true },
    { label: "Billing", href: "/dashboard/billing", icon: "wallet", tour: "billing", group: "main", bottom: true, count: "billing" },
    { label: "Files", href: "/dashboard/files", icon: "folder", tour: "files", group: "main", bottom: true },
    { label: "Support", href: "/dashboard/support", icon: "help", tour: "support", group: "main", bottom: true },
    { label: "Notifications", href: "/dashboard/notifications", icon: "bell", tour: "notifications", group: "general", count: "unread" },
    { label: "Settings", href: "/dashboard/settings", icon: "settings", tour: "settings", group: "general" },
  ],
};

/** Old client paths that belong to a nav section. */
const ALIASES: Record<string, string> = {
  "/dashboard/invoices": "/dashboard/billing",
  "/dashboard/quotes": "/dashboard/billing",
};

export function isActive(href: string, pathname: string, root: string): boolean {
  if (href === root) return pathname === root;
  const p = Object.entries(ALIASES).reduce((acc, [from, to]) => (acc.startsWith(from) ? acc.replace(from, to) : acc), pathname);
  return p === href || p.startsWith(href + "/");
}
