"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, LogOut, Home, Bell, UserPlus, Send, CheckCircle2, LifeBuoy, MessageSquare, Inbox, AlertTriangle, CalendarClock } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { CalculatorButton } from "@/components/calculators/calculator-launcher";
import { TourLauncher } from "@/components/tour/tour-launcher";
import { signOut } from "@/lib/auth-client";
import { activeNavItem } from "./nav";
import type { NotificationItem } from "@/lib/db/queries/notifications";
import { cn } from "@/lib/utils";
import { initialsOf, timeAgo } from "@/components/ui/avatar";

export type AdminUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string | null;
};

const NOTIF_ICON = { 
  lead: UserPlus, 
  invoice_sent: Send, 
  invoice_paid: CheckCircle2,
  ticket_created: LifeBuoy,
  ticket_replied: MessageSquare,
  request: Inbox,
  payment: CheckCircle2,
  payment_flagged: AlertTriangle,
  consultation: CalendarClock
} as const;


const SEEN_KEY = "litch:notif-seen";

function NotificationBell({ notifications }: { notifications: NotificationItem[] }) {
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<number>(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setLastSeen(Number(localStorage.getItem(SEEN_KEY) || 0));
    } catch {}
  }, []);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const unread = notifications.filter((n) => new Date(n.at).getTime() > lastSeen).length;

  function markAllRead() {
    const now = Date.now();
    try {
      localStorage.setItem(SEEN_KEY, String(now));
    } catch {}
    setLastSeen(now);
  }

  function toggle() {
    setOpen((o) => {
      if (!o && unread > 0) markAllRead();
      return !o;
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Notifications"
        onClick={toggle}
        className="relative grid size-9 place-items-center rounded-full border border-hairline text-body transition-colors hover:bg-surface hover:text-ink"
      >
        <Bell className="size-4.5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-[16px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-2xl border border-hairline bg-paper shadow-xl shadow-black/10">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            {notifications.length > 0 && (
              <button onClick={markAllRead} className="text-xs font-medium text-brand hover:underline">
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-body">You&rsquo;re all caught up.</p>
              <p className="mt-1 text-xs text-muted">New activity will show up here.</p>
            </div>
          ) : (
            <ul className="max-h-80 divide-y divide-hairline overflow-y-auto">
              {notifications.slice(0, 6).map((n) => {
                const Icon = NOTIF_ICON[n.type];
                return (
                  <li key={n.id}>
                    <Link
                      href={n.href}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface"
                    >
                      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand-tint text-brand">
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{n.title}</p>
                        <p className="truncate text-xs text-body">{n.description}</p>
                      </div>
                      <span className="shrink-0 text-[11px] text-muted">{timeAgo(n.at)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <Link
            href="/admin/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-hairline px-4 py-3 text-center text-sm font-medium text-brand transition-colors hover:bg-surface"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
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
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function AdminTopbar({
  onMenuClick,
  user,
  notifications,
}: {
  onMenuClick: () => void;
  user: AdminUser;
  notifications: NotificationItem[];
}) {
  const pathname = usePathname();
  const title = activeNavItem(pathname)?.label ?? "Dashboard";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-hairline bg-paper/85 px-4 backdrop-blur-md sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open menu"
        data-tour="mobile-menu"
        className="grid size-9 shrink-0 place-items-center rounded-lg text-body transition-colors hover:bg-surface hover:text-ink lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      <h1 className="truncate font-display text-base font-bold tracking-tight text-ink sm:text-lg">{title}</h1>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <div className="relative hidden sm:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            placeholder="Search…"
            className={cn(
              "h-9 w-44 rounded-full border border-hairline bg-surface pl-9 pr-3 text-sm text-ink outline-none transition-all",
              "placeholder:text-muted focus:w-60 focus:border-brand lg:w-56",
            )}
          />
        </div>
        <TourLauncher />
        <CalculatorButton isAdmin={true} tone="dark" className="size-9 border border-hairline" />
        <ThemeToggle />
        <NotificationBell notifications={notifications} />
        <AccountDropdown user={user} />
      </div>
    </header>
  );
}
