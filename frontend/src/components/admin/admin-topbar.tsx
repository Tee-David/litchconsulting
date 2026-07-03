"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, LogOut, Home } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { signOut } from "@/lib/auth-client";
import { activeNavItem } from "./nav";

export type AdminUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string | null;
};

function initialsOf(name?: string | null, email?: string | null) {
  const src = (name || email || "").trim();
  if (!src) return "A";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function AccountDropdown({ user }: { user: AdminUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}
        className="grid size-9 place-items-center overflow-hidden rounded-full bg-brand text-xs font-semibold text-white ring-2 ring-hairline transition-transform hover:scale-105"
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="size-full object-cover" />
        ) : (
          initialsOf(user.name, user.email)
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-hairline bg-paper p-1.5 shadow-xl shadow-black/10">
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-ink">{user.name || "Admin"}</p>
            {user.email && <p className="truncate text-xs text-muted">{user.email}</p>}
          </div>
          <div className="my-1 h-px bg-hairline" />
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface"
          >
            <Home className="size-4 text-muted" />
            Back to site
          </Link>
          <button
            type="button"
            onClick={() => void signOut().then(() => (window.location.href = "/login"))}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface"
          >
            <LogOut className="size-4 text-muted" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function AdminTopbar({ onMenuClick, user }: { onMenuClick: () => void; user: AdminUser }) {
  const pathname = usePathname();
  const title = activeNavItem(pathname)?.label ?? "Dashboard";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-hairline bg-paper/85 px-4 backdrop-blur-md sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open menu"
        className="grid size-9 shrink-0 place-items-center rounded-lg text-body transition-colors hover:bg-surface hover:text-ink lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      <h1 className="truncate font-display text-base font-bold tracking-tight text-ink sm:text-lg">
        {title}
      </h1>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <div className="relative hidden sm:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            placeholder="Search…"
            className="h-9 w-44 rounded-full border border-hairline bg-surface pl-9 pr-3 text-sm text-ink outline-none transition-all placeholder:text-muted focus:w-60 focus:border-brand lg:w-56"
          />
        </div>
        <ThemeToggle />
        <AccountDropdown user={user} />
      </div>
    </header>
  );
}
