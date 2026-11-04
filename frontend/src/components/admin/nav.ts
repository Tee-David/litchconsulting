import type { ComponentType } from "react";
import { SageIcon } from "@/components/admin/sage-icon";
import {
  Home,
  Inbox,
  Building2,
  Table2,
  Wallet,
  LifeBuoy,
  ScrollText,
  Trash2,
  Settings,
  BarChart3,
  PenSquare,
} from "lucide-react";
import { canAccess, type Area, type Role } from "@/lib/access";

/**
 * Single source of truth for the firm sidebar, the mobile bottom bar, the
 * breadcrumb and the ⌘K palette. Every item names the access area it needs,
 * so the same shell can render read-only for staff later: `navFor(role)`
 * drops what the role cannot open (the pages re-check on the server).
 */
export type NavBadgeKey = "attention" | "requests" | "billing" | "helpDesk";

export type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  group: "main" | "general";
  area: Area;
  /** Stable key for `data-tour="nav-<tourKey>"` anchors used by the guided tour. */
  tourKey: string;
  /** Which live count (from the layout) shows beside the label. */
  badge?: NavBadgeKey;
  /** Shown in the phone bottom bar (max 4; the 5th slot is "More"). */
  bottom?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/admin", icon: Home, group: "main", area: "home", tourKey: "dashboard", badge: "attention", bottom: true },
  { label: "Requests", href: "/admin/requests", icon: Inbox, group: "main", area: "requests", tourKey: "requests", badge: "requests", bottom: true },
  { label: "Clients", href: "/admin/clients", icon: Building2, group: "main", area: "clients", tourKey: "clients" },
  { label: "Analyses", href: "/admin/analyses", icon: Table2, group: "main", area: "analyses", tourKey: "litchai" },
  { label: "Billing", href: "/admin/billing", icon: Wallet, group: "main", area: "billing", tourKey: "finance", badge: "billing", bottom: true },
  { label: "Help desk", href: "/admin/help-desk", icon: LifeBuoy, group: "main", area: "helpDesk", tourKey: "help-desk", badge: "helpDesk", bottom: true },
  { label: "Sage", href: "/admin/sage", icon: SageIcon, group: "general", area: "sage", tourKey: "copilot" },
  { label: "Reports", href: "/admin/reports", icon: BarChart3, group: "general", area: "reports", tourKey: "reports" },
  { label: "Website", href: "/admin/blog", icon: PenSquare, group: "general", area: "content", tourKey: "blog" },
  { label: "Audit log", href: "/admin/audit", icon: ScrollText, group: "general", area: "audit", tourKey: "audit" },
  { label: "Trash", href: "/admin/trash", icon: Trash2, group: "general", area: "trash", tourKey: "trash" },
  { label: "Settings", href: "/admin/settings", icon: Settings, group: "general", area: "settings", tourKey: "settings" },
];

/** The nav a role may see. */
export function navFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((i) => canAccess(role, i.area));
}

/** Whether a nav item is active for the given pathname. */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  if (href === "/admin/blog") return pathname.startsWith("/admin/blog") || pathname.startsWith("/admin/services");
  return pathname === href || pathname.startsWith(href + "/");
}

/** Best-matching nav item for a pathname (for the topbar title). */
export function activeNavItem(pathname: string): NavItem | undefined {
  return [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => isNavActive(i.href, pathname));
}

/** Human names for second-level path segments, used by the breadcrumb. */
const SEGMENT_LABEL: Record<string, string> = {
  new: "New",
  edit: "Edit",
  invoices: "Invoices",
  quotes: "Quotes",
  payments: "Payments",
  expenses: "Expenses",
  tools: "Tools",
  receipts: "Receipts",
  calculators: "Calculators",
  templates: "Templates",
  integrations: "Integrations",
  access: "Team and access",
  notifications: "Notifications",
  backups: "Backups",
  editor: "Editor",
  observability: "Observability",
  services: "Services",
};

export type Crumb = { label: string; href?: string };

const isId = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s) || /^[0-9a-f]{24,}$/i.test(s);

/** Breadcrumb from the pathname: section, then readable sub-pages. Ids read as "Details". */
export function crumbsFor(pathname: string): Crumb[] {
  const item = activeNavItem(pathname);
  const out: Crumb[] = [];
  if (pathname === "/admin/notifications") return [{ label: "Notifications" }];
  if (pathname.startsWith("/admin/services")) out.push({ label: "Website", href: "/admin/blog" }, { label: "Services" });
  else if (item) out.push({ label: item.label, href: item.href });
  if (!item || pathname === item.href || pathname.startsWith("/admin/services")) return out.map((c, i, a) => (i === a.length - 1 ? { label: c.label } : c));
  const rest = pathname.slice(item.href.length).split("/").filter(Boolean);
  let acc = item.href;
  rest.forEach((seg) => {
    acc += `/${seg}`;
    out.push({ label: isId(seg) ? "Details" : SEGMENT_LABEL[seg] ?? seg.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()), href: acc });
  });
  return out.map((c, i, a) => (i === a.length - 1 ? { label: c.label } : c));
}
