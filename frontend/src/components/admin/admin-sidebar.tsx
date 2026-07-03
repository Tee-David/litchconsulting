"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { NAV_ITEMS, isNavActive, type NavItem } from "./nav";
import { cn } from "@/lib/utils";

/** Sidebar navigation content — reused by the desktop rail and mobile drawer. */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
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
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          active
            ? "bg-brand text-white shadow-sm shadow-brand/25"
            : "text-body hover:bg-surface hover:text-ink",
        )}
      >
        <Icon
          className={cn(
            "size-[18px] shrink-0",
            active ? "text-white" : "text-muted group-hover:text-ink",
          )}
        />
        {item.label}
      </Link>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link href="/admin" onClick={onNavigate} aria-label="Litch admin">
          <Logo className="h-8" />
        </Link>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6">
        {main.map(renderItem)}
        <p className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted">
          General
        </p>
        {general.map(renderItem)}
      </nav>
    </div>
  );
}
