"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Logo, LogoMark } from "@/components/ui/logo";
import { signOut } from "@/lib/auth-client";
import { CLIENT_NAV_ITEMS, isClientNavActive, type ClientNavItem } from "./client-nav";
import { cn } from "@/lib/utils";

/** Client Sidebar navigation — reused by the desktop rail (collapsible) and mobile drawer. */
export function ClientSidebarNav({
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
  const main = CLIENT_NAV_ITEMS.filter((i) => i.group === "main");
  const general = CLIENT_NAV_ITEMS.filter((i) => i.group === "general");

  const renderItem = (item: ClientNavItem) => {
    const active = isClientNavActive(item.href, pathname);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        data-tour={`nav-${item.tourKey}`}
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
        <Link href="/dashboard" onClick={onNavigate} aria-label="Litch Portal">
          {collapsed ? <LogoMark className="size-8" /> : <Logo className="h-8" />}
        </Link>
        {!collapsed && onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
            data-tour="sidebar-pin"
            title={pinnedCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={pinnedCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            {pinnedCollapsed ? <PanelLeftOpen className="size-4.5" /> : <PanelLeftClose className="size-4.5" />}
          </button>
        )}
      </div>

      <nav className={cn("flex flex-1 flex-col overflow-y-auto pb-4", collapsed ? "px-2" : "px-3")}>
        <div className="space-y-1">{main.map(renderItem)}</div>
        <div className="mt-auto space-y-1 pt-4">
          {collapsed ? (
            <div className="mx-2 mb-3 h-px bg-hairline" />
          ) : (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Support & settings</p>
          )}
          {general.map(renderItem)}
        </div>
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
