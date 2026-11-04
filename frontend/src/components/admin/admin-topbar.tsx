"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home, LogOut, Menu, Search, UserRound } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { TourLauncher } from "@/components/tour/tour-launcher";
import { NotificationBell } from "@/components/kit";
import { signOut } from "@/lib/auth-client";
import { SageIcon } from "./sage-icon";
import { crumbsFor } from "./nav";
import { cn } from "@/lib/utils";

export type AdminUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string | null;
};

/** Ask the ⌘K palette to open (it listens for this event). */
export function openCommandPalette() {
  window.dispatchEvent(new Event("litch:palette"));
}

function AccountMenu({ user }: { user: AdminUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="relative hidden sm:block" ref={ref}>
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-10 place-items-center rounded-ctl border border-hairline bg-paper text-ink hover:bg-surface"
      >
        <UserRound className="size-[18px]" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-60 rounded-card border border-hairline bg-paper p-1.5 shadow-xl">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-ink">{user.name || "Admin"}</p>
            {user.email && <p className="truncate text-xs text-muted">{user.email}</p>}
          </div>
          <div className="my-1 h-px bg-hairline" />
          <Link role="menuitem" href="/" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-ctl px-3 py-2 text-sm text-ink hover:bg-surface">
            <Home className="size-4 text-muted" /> Back to the website
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={() => void signOut().then(() => (window.location.href = "/login"))}
            className="flex w-full items-center gap-2.5 rounded-ctl px-3 py-2 text-sm text-bad hover:bg-bad-soft"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Topbar: breadcrumb, ⌘K search, the bell, Ask Sage. On phones the search and
 * Sage collapse to icon buttons and the hamburger opens the drawer.
 */
export function AdminTopbar({ onMenuClick, user }: { onMenuClick: () => void; user: AdminUser }) {
  const pathname = usePathname() ?? "/admin";
  const crumbs = crumbsFor(pathname);
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);

  return (
    <header className="sticky top-0 z-30 flex h-[62px] items-center gap-2 border-b border-hairline bg-paper/90 px-3 backdrop-blur-md sm:gap-2.5 sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open menu"
        data-tour="mobile-menu"
        className="grid size-10 shrink-0 place-items-center rounded-ctl text-ink hover:bg-surface lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[13px]">
        {crumbs.map((c, i) => (
          <Fragment key={`${c.label}-${i}`}>
            {i > 0 && <ChevronRight aria-hidden className="size-3.5 shrink-0 text-faint" />}
            {c.href ? (
              <Link href={c.href} className={cn("text-muted hover:text-ink", i < crumbs.length - 2 && "hidden sm:inline")}>
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate font-semibold text-ink">
                {c.label}
              </span>
            )}
          </Fragment>
        ))}
      </nav>

      <button
        type="button"
        onClick={openCommandPalette}
        data-tour="search"
        aria-label="Search clients, requests and invoices"
        className="flex h-10 shrink-0 items-center gap-2 rounded-ctl border border-line-strong bg-cloud px-2.5 text-[13.5px] text-muted hover:text-ink max-md:w-10 max-md:justify-center md:w-56 lg:w-64"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden min-w-0 flex-1 truncate text-left md:inline">Search clients, requests, invoices</span>
        <kbd className="hidden rounded border border-hairline bg-paper px-1.5 font-sans text-[11px] text-muted md:inline">{mac ? "⌘K" : "Ctrl K"}</kbd>
      </button>

      <div className="hidden sm:block">
        <TourLauncher />
      </div>
      <div className="hidden sm:block">
        <ThemeToggle />
      </div>
      <div data-tour="bell">
        <NotificationBell allHref="/admin/notifications" />
      </div>
      {!pathname.startsWith("/admin/sage") && (
        <Link
          href="/admin/sage"
          data-tour="sage"
          aria-label="Ask Sage"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-ctl border border-line-strong bg-paper px-2.5 text-[13.5px] font-semibold text-ink hover:bg-surface max-sm:w-10 max-sm:justify-center"
        >
          <SageIcon className="size-[18px] text-accent" />
          <span className="hidden sm:inline">Ask Sage</span>
        </Link>
      )}
      <AccountMenu user={user} />
    </header>
  );
}
