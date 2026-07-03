"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Logo, LogoMark } from "@/components/ui/logo";
import { signOut } from "@/lib/auth-client";
import { NAV_ITEMS, isNavActive, type NavItem } from "./nav";
import { cn } from "@/lib/utils";

/** Sidebar navigation — reused by the desktop rail (collapsible) and mobile drawer. */
export function SidebarNav({
  onNavigate,
  collapsed = false,
  pinnedCollapsed,
  onTogglePin,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  pinnedCollapsed?: boolean;
  onTogglePin?: () => void;
}) {
  const pathname = usePathname();
  const main = NAV_ITEMS.filter((i) => i.group === "main");
  const general = NAV_ITEMS.filter((i) => i.group === "general");

  const renderItem = (item: NavItem) => {
    const active = isNavActive(item.href, pathname);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        title={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex items-center rounded-xl text-sm font-medium transition-colors",
          collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
          active ? "bg-brand text-white shadow-sm shadow-brand/25" : "text-body hover:bg-surface hover:text-ink",
        )}
      >
        <Icon className={cn("size-[18px] shrink-0", active ? "text-white" : "text-muted group-hover:text-ink")} />
        {!collapsed && item.label}
      </Link>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 shrink-0 items-center", collapsed ? "justify-center" : "justify-between px-4")}>
        <Link href="/admin" onClick={onNavigate} aria-label="Litch admin">
          {collapsed ? <LogoMark className="size-8" /> : <Logo className="h-8" />}
        </Link>
        {!collapsed && onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
            title={pinnedCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={pinnedCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            {pinnedCollapsed ? <PanelLeftOpen className="size-4.5" /> : <PanelLeftClose className="size-4.5" />}
          </button>
        )}
      </div>

      <nav className={cn("flex-1 space-y-1 overflow-y-auto pb-4", collapsed ? "px-2" : "px-3")}>
        {main.map(renderItem)}
        {collapsed ? (
          <div className="mx-2 my-3 h-px bg-hairline" />
        ) : (
          <p className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted">General</p>
        )}
        {general.map(renderItem)}
      </nav>

      {/* Logout */}
      <div className={cn("border-t border-hairline", collapsed ? "p-2" : "p-3")}>
        <button
          type="button"
          onClick={() => void signOut().then(() => (window.location.href = "/login"))}
          title={collapsed ? "Sign out" : undefined}
          className={cn(
            "group flex w-full items-center rounded-xl text-sm font-medium text-body transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400",
            collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
          )}
        >
          <LogOut className="size-[18px] shrink-0" />
          {!collapsed && "Sign out"}
        </button>
      </div>
    </div>
  );
}
