"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  FolderClosed,
  Home,
  Inbox,
  LifeBuoy,
  LogOut,
  Menu,
  MessageCircleQuestionMark,
  MessagesSquare,
  Search,
  Settings,
  Table2,
  Wallet,
  X,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { NotificationBell } from "@/components/kit";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { NAV, isActive, type NavIcon, type NavItem, type ShellKind } from "./nav";

const ICONS: Record<NavIcon, typeof Home> = {
  home: Home,
  inbox: Inbox,
  wallet: Wallet,
  folder: FolderClosed,
  help: LifeBuoy,
  bell: Bell,
  settings: Settings,
  table: Table2,
  msg: MessagesSquare,
  sage: MessageCircleQuestionMark,
};

export type ShellCounts = Partial<Record<NonNullable<NavItem["count"]>, number>>;

/**
 * Shell for the staff workspace (/work) and the client portal (/dashboard).
 * ≥ lg: a left rail (icons) that widens to a labelled sidebar at xl.
 * < lg: a top bar with a drawer, plus a bottom tab bar for the main places.
 * The topbar carries search (into the requests table), the bell and the
 * account menu. Every nav link has a `data-tour` anchor.
 */
export function AppShell({
  kind,
  user,
  counts = {},
  banner,
  launcher,
  children,
}: {
  kind: ShellKind;
  user: { name: string; email: string; sub: string };
  counts?: ShellCounts;
  banner?: ReactNode;
  /** Optional slot in the topbar (e.g. the tour launcher). */
  launcher?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const root = kind === "staff" ? "/work" : "/dashboard";
  const items = NAV[kind];
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [pathname]);
  const current = items.find((i) => isActive(i.href, pathname, root));

  return (
    <div className="min-h-dvh bg-desk text-ink lg:grid lg:grid-cols-[72px_1fr] xl:grid-cols-[232px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-ctl focus:bg-paper focus:px-3 focus:py-2">
        Skip to content
      </a>

      {/* Desktop rail / sidebar */}
      <aside aria-label="Main navigation" className="sticky top-0 hidden h-dvh flex-col border-r border-hairline bg-paper lg:flex">
        <Sidebar kind={kind} items={items} counts={counts} pathname={pathname} root={root} user={user} />
      </aside>

      {/* Phone/tablet drawer */}
      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-scrim" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-paper shadow-2xl">
            <button
              type="button"
              onClick={() => setDrawer(false)}
              aria-label="Close menu"
              className="absolute right-3 top-4 grid size-9 place-items-center rounded-ctl text-muted hover:bg-surface"
            >
              <X className="size-5" />
            </button>
            <Sidebar kind={kind} items={items} counts={counts} pathname={pathname} root={root} user={user} expanded />
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-hairline bg-paper/90 px-3 backdrop-blur sm:px-5">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
            data-tour="mobile-menu"
            className="grid size-10 place-items-center rounded-ctl text-ink hover:bg-surface lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <p className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold text-ink">{current?.label ?? (kind === "staff" ? "My work" : "Home")}</p>
          <SearchBox kind={kind} />
          {launcher}
          <ThemeToggle className="hidden sm:grid" />
          <div data-tour="bell">
            <NotificationBell allHref={`${root}/notifications`} />
          </div>
        </header>
        {banner}
        <main id="main" className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12">
          {children}
        </main>
      </div>

      <BottomBar items={items.filter((i) => i.bottom)} counts={counts} pathname={pathname} root={root} />
    </div>
  );
}

function Count({ n, hot }: { n?: number; hot?: boolean }) {
  if (!n) return null;
  return (
    <span
      className={cn(
        "ml-auto grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold leading-5 tabular-nums",
        hot ? "bg-act text-act-ink" : "bg-surface text-body",
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

function Sidebar({
  kind,
  items,
  counts,
  pathname,
  root,
  user,
  expanded = false,
}: {
  kind: ShellKind;
  items: NavItem[];
  counts: ShellCounts;
  pathname: string;
  root: string;
  user: { name: string; email: string; sub: string };
  expanded?: boolean;
}) {
  // `expanded` = drawer (always labelled). Otherwise labels appear at xl.
  const lbl = expanded ? "" : "hidden xl:inline";
  const groups: Array<["main" | "general", string | null]> = [
    ["main", null],
    ["general", kind === "client" ? "Your account" : "General"],
  ];
  return (
    <>
      <div className={cn("flex h-16 shrink-0 items-center border-b border-hairline", expanded ? "px-5" : "justify-center xl:justify-start xl:px-5")}>
        <Link href={root} aria-label="Litch Consulting home">
          {expanded ? <Logo className="h-7" /> : (
            <>
              <LogoMark className="size-8 xl:hidden" />
              <Logo className="hidden h-7 xl:block" />
            </>
          )}
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        {groups.map(([g, title]) => {
          const list = items.filter((i) => i.group === g);
          if (!list.length) return null;
          return (
            <div key={g} className={cn("flex flex-col gap-1", g === "general" && "mt-4 border-t border-hairline pt-4")}>
              {title ? <p className={cn("px-3 pb-1 text-xs font-medium text-muted", lbl)}>{title}</p> : null}
              {list.map((item) => {
                const Icon = ICONS[item.icon];
                const active = isActive(item.href, pathname, root);
                const n = item.count ? counts[item.count] : undefined;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-tour={`nav-${item.tour}`}
                    aria-current={active ? "page" : undefined}
                    title={item.label}
                    className={cn(
                      "group relative flex h-10 items-center gap-3 rounded-ctl text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40",
                      expanded ? "px-3" : "justify-center px-0 xl:justify-start xl:px-3",
                      active ? "bg-brand-tint text-ink" : "text-body hover:bg-surface hover:text-ink",
                    )}
                  >
                    {active ? <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-act" /> : null}
                    <Icon className={cn("size-[18px] shrink-0", active ? "text-ink" : "text-muted group-hover:text-ink")} />
                    <span className={lbl}>{item.label}</span>
                    {n ? (
                      <>
                        <span className={cn(lbl, "ml-auto")}>
                          <Count n={n} hot={item.count === "attention"} />
                        </span>
                        {!expanded ? (
                          <span aria-hidden className="absolute right-2 top-1.5 size-2 rounded-full bg-act xl:hidden" />
                        ) : null}
                      </>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <AccountMenu user={user} expanded={expanded} />
    </>
  );
}

function AccountMenu({ user, expanded }: { user: { name: string; email: string; sub: string }; expanded: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const initials = (user.name || user.email).split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  const lbl = expanded ? "" : "hidden xl:block";
  return (
    <div className="border-t border-hairline p-3">
      <div className={cn("flex items-center gap-3", !expanded && "justify-center xl:justify-start")}>
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-tint text-sm font-semibold text-ink">
          {initials || "?"}
        </span>
        <div className={cn("min-w-0 flex-1", lbl)}>
          <p className="truncate text-sm font-semibold text-ink">{user.name || user.email}</p>
          <p className="truncate text-xs text-muted">{user.sub}</p>
        </div>
      </div>
      <button
        type="button"
        disabled={busy}
        data-tour="sign-out"
        onClick={async () => {
          setBusy(true);
          try {
            await signOut();
          } finally {
            router.push("/login");
          }
        }}
        title="Sign out"
        className={cn(
          "mt-2 flex h-9 w-full items-center gap-2 rounded-ctl text-sm text-body hover:bg-surface hover:text-ink disabled:opacity-60",
          expanded ? "px-3" : "justify-center xl:justify-start xl:px-3",
        )}
      >
        <LogOut className="size-4" />
        <span className={expanded ? "" : "hidden xl:inline"}>{busy ? "Signing out…" : "Sign out"}</span>
      </button>
    </div>
  );
}

function SearchBox({ kind }: { kind: ShellKind }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const target = kind === "staff" ? "/work/requests" : "/dashboard/requests";
  const placeholder = kind === "staff" ? "Search your requests" : "Search your requests";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => input.current?.focus(), 10);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const submit = (q: string) => {
    setOpen(false);
    router.push(q.trim() ? `${target}?q=${encodeURIComponent(q.trim())}` : target);
  };
  return (
    <>
      <form
        role="search"
        data-tour="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit(new FormData(e.currentTarget).get("q") as string);
        }}
        className="hidden h-10 w-64 items-center gap-2 rounded-ctl border border-hairline bg-surface px-3 text-sm focus-within:border-accent md:flex"
      >
        <Search className="size-4 text-muted" aria-hidden />
        <label className="sr-only" htmlFor={`search-${kind}`}>{placeholder}</label>
        <input id={`search-${kind}`} name="q" placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-faint" />
        <kbd className="rounded border border-hairline bg-paper px-1.5 text-[11px] text-muted">Ctrl K</kbd>
      </form>
      <button
        type="button"
        aria-label="Search"
        onClick={() => {
          setOpen(true);
          setTimeout(() => input.current?.focus(), 10);
        }}
        className="grid size-10 place-items-center rounded-ctl border border-hairline bg-paper text-ink hover:bg-surface md:hidden"
      >
        <Search className="size-[18px]" />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Search">
          <div className="absolute inset-0 bg-scrim" onClick={() => setOpen(false)} aria-hidden />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(new FormData(e.currentTarget).get("q") as string);
            }}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
            className="absolute inset-x-3 top-16 mx-auto flex max-w-lg items-center gap-2 rounded-card border border-hairline bg-paper p-2 shadow-2xl"
          >
            <Search className="ml-2 size-4 text-muted" aria-hidden />
            <input ref={input} name="q" aria-label={placeholder} placeholder={`${placeholder}, then press Enter`} className="h-10 min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-faint" />
            <button type="submit" className="h-9 rounded-ctl bg-act px-3 text-sm font-semibold text-act-ink hover:bg-act-hover">Search</button>
          </form>
        </div>
      ) : null}
    </>
  );
}

function BottomBar({ items, counts, pathname, root }: { items: NavItem[]; counts: ShellCounts; pathname: string; root: string }) {
  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-30 grid border-t border-hairline bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(item.href, pathname, root);
        const n = item.count ? counts[item.count] : undefined;
        return (
          <Link
            key={item.href}
            href={item.href}
            data-tour={`tab-${item.tour}`}
            aria-current={active ? "page" : undefined}
            className={cn("relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-ink" : "text-muted")}
          >
            {active ? <span aria-hidden className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-act" /> : null}
            <span className="relative">
              <Icon className="size-5" />
              {n ? (
                <span className="absolute -right-2.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-act px-1 text-[10px] font-semibold leading-4 text-act-ink">
                  {n > 9 ? "9+" : n}
                </span>
              ) : null}
            </span>
            <span className="max-w-full truncate px-1">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
