"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { Logo, LogoMark } from "@/components/ui/logo";
import { signOut } from "@/lib/auth-client";
import { isNavActive, type NavBadgeKey, type NavItem } from "./nav";
import { cn } from "@/lib/utils";

export type NavCounts = Partial<Record<NavBadgeKey, number>>;
export type ShellUser = { name?: string | null; email?: string | null; image?: string | null; roleLabel: string };

function initials(name?: string | null, email?: string | null) {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/**
 * The firm sidebar — used as the desktop rail (labels at ≥ xl, icons only
 * between lg and xl or when pinned collapsed) and inside the phone drawer.
 * Counts are the live numbers from the layout; "hot" (the attention count)
 * reads red so the worst thing in the firm is never more than a glance away.
 */
export function SidebarNav({
  items,
  counts = {},
  user,
  sageOnline,
  onNavigate,
  collapsed = false,
  pinnedCollapsed,
  onTogglePin,
  onClose,
}: {
  items: NavItem[];
  counts?: NavCounts;
  user: ShellUser;
  sageOnline: boolean;
  onNavigate?: () => void;
  collapsed?: boolean;
  pinnedCollapsed?: boolean;
  onTogglePin?: () => void;
  /** Drawer mode: shows a close button. */
  onClose?: () => void;
}) {
  const pathname = usePathname() ?? "/admin";
  const main = items.filter((i) => i.group === "main");
  const general = items.filter((i) => i.group === "general");

  const renderItem = (item: NavItem) => {
    const active = isNavActive(item.href, pathname);
    const Icon = item.icon;
    const n = item.badge ? counts[item.badge] ?? 0 : 0;
    const hot = item.badge === "attention";
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        data-tour={`nav-${item.tourKey}`}
        title={collapsed ? (n ? `${item.label}, ${n}` : item.label) : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex h-10 items-center rounded-ctl text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40",
          collapsed ? "justify-center px-0" : "gap-3 px-2.5",
          active ? "keep-brand bg-act text-act-ink" : "text-body hover:bg-surface hover:text-ink",
        )}
      >
        <Icon className={cn("size-[18px] shrink-0", active ? "text-act-ink" : "text-muted group-hover:text-ink")} />
        {!collapsed && <span className="truncate">{item.label}</span>}
        {n > 0 &&
          (collapsed ? (
            <span
              aria-hidden
              className={cn("absolute right-2 top-2 size-2 rounded-full", hot ? "bg-bad" : "bg-accent")}
            />
          ) : (
            <span
              className={cn(
                "ml-auto rounded-full px-1.5 text-[11.5px] font-semibold leading-5 tabular-nums",
                active ? "bg-white/20 text-act-ink" : hot ? "bg-bad-soft text-bad" : "bg-surface text-ink",
              )}
            >
              {n > 99 ? "99+" : n}
              <span className="sr-only"> waiting</span>
            </span>
          ))}
      </Link>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-[62px] shrink-0 items-center", collapsed ? "justify-center" : "justify-between pl-4 pr-3")}>
        <Link href="/admin" onClick={onNavigate} aria-label="Litch Consulting, admin home" className="rounded-ctl outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
          {collapsed ? <LogoMark className="size-8" /> : <Logo className="h-8" />}
        </Link>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="grid size-9 place-items-center rounded-ctl text-muted hover:bg-surface hover:text-ink"
          >
            <X className="size-5" />
          </button>
        ) : !collapsed && onTogglePin ? (
          <button
            type="button"
            onClick={onTogglePin}
            data-tour="sidebar-pin"
            aria-label={pinnedCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={pinnedCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="grid size-8 place-items-center rounded-ctl text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            {pinnedCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        ) : null}
      </div>

      <nav aria-label="Main navigation" className={cn("flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pb-3", collapsed ? "px-2.5" : "px-3")}>
        {main.map(renderItem)}
        {general.length > 0 &&
          (collapsed ? (
            <div aria-hidden className="mx-2 my-2 h-px bg-hairline" />
          ) : (
            <p className="px-2.5 pb-1 pt-4 text-[11px] font-semibold text-muted">General</p>
          ))}
        {general.map(renderItem)}
      </nav>

      <div className={cn("flex flex-col gap-2 border-t border-hairline", collapsed ? "p-2.5" : "p-3")}>
        <div
          className={cn("flex items-center gap-2 rounded-ctl bg-surface text-xs text-body", collapsed ? "justify-center p-2" : "px-2.5 py-2")}
          title={sageOnline ? "Sage is connected" : "Sage is not connected on this deployment"}
        >
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", sageOnline ? "bg-good" : "bg-faint")} />
          {!collapsed && <span className="truncate">{sageOnline ? "Sage online" : "Sage offline"}</span>}
          {collapsed && <span className="sr-only">{sageOnline ? "Sage online" : "Sage offline"}</span>}
        </div>
        <div className={cn("flex items-center gap-2.5", collapsed && "flex-col")}>
          <span
            aria-hidden
            className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-tint text-xs font-semibold text-brand"
          >
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" className="size-full object-cover" />
            ) : (
              initials(user.name, user.email)
            )}
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-semibold text-ink">{user.name || user.email}</p>
              <p className="truncate text-xs text-muted">{user.roleLabel}</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => void signOut().then(() => (window.location.href = "/login"))}
            aria-label="Sign out"
            title="Sign out"
            className="grid size-8 shrink-0 place-items-center rounded-ctl text-muted transition-colors hover:bg-bad-soft hover:text-bad"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
