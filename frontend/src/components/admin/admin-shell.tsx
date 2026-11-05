"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { MoreHorizontal } from "lucide-react";
import { SidebarNav, type NavCounts, type ShellUser } from "./admin-sidebar";
import { AdminTopbar, type AdminUser } from "./admin-topbar";
import { InstallPrompt } from "./install-prompt";
import { CommandPalette } from "./command-palette";
import { SageFab } from "./sage-fab";
import { TourProvider } from "../tour/tour-provider";
import { isNavActive, navFor } from "./nav";
import { roleOf, ROLE_LABEL } from "@/lib/access";
import { cn } from "@/lib/utils";

/**
 * The firm shell (admin today; staff can reuse it read-only because the nav
 * is filtered by the access map).
 *
 *   ≥ xl   236px sidebar with labels; can be pinned collapsed to the rail
 *   lg–xl  68px icon rail
 *   < lg   topbar hamburger → drawer, plus a bottom bar with the four most
 *          used sections and "More"
 */
export function AdminShell({
  user,
  counts,
  sageOnline,
  children,
}: {
  user: AdminUser;
  counts: NavCounts;
  sageOnline: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/admin";
  const role = roleOf(user);
  const items = navFor(role);
  const shellUser: ShellUser = { name: user.name, email: user.email, image: user.image, roleLabel: ROLE_LABEL[role] };

  const [mobileOpen, setMobileOpen] = useState(false);
  /** lg–xl: the icon rail opened as an overlay (not persisted). */
  const [railOpen, setRailOpen] = useState(false);
  /** ≥ xl: the sidebar pinned to the icon rail (persisted). */
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);

  useEffect(() => {
    try {
      setPinnedCollapsed(localStorage.getItem("litch:sidebar-collapsed") === "1");
    } catch {
      /* private mode: default expanded */
    }
  }, []);
  // Close the drawer / overlay on navigation.
  useEffect(() => {
    setMobileOpen(false);
    setRailOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!mobileOpen && !railOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMobileOpen(false);
      setRailOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, railOpen]);
  // The overlay only exists between lg and xl; drop it if the window leaves that range.
  useEffect(() => {
    if (!railOpen) return;
    const mq = window.matchMedia("(min-width: 1024px) and (max-width: 1279.98px)");
    const onChange = () => !mq.matches && setRailOpen(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [railOpen]);
  // Ctrl/⌘+B toggles the sidebar for the current width — never while typing
  // (the blog editor uses Ctrl+B for bold).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "b") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (window.matchMedia("(min-width: 1280px)").matches) {
        e.preventDefault();
        togglePin();
      } else if (window.matchMedia("(min-width: 1024px)").matches) {
        e.preventDefault();
        setRailOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function togglePin() {
    setPinnedCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("litch:sidebar-collapsed", next ? "1" : "0");
      } catch {
        /* not persisted */
      }
      return next;
    });
  }

  const bottom = items.filter((i) => i.bottom).slice(0, 4);
  const moreActive = !bottom.some((i) => isNavActive(i.href, pathname));

  return (
    <TourProvider audience="admin">
      <div
        className={cn(
          "min-h-dvh bg-cloud lg:grid lg:grid-cols-[68px_minmax(0,1fr)] lg:transition-[grid-template-columns] lg:duration-200 motion-reduce:transition-none",
          !pinnedCollapsed && "xl:grid-cols-[236px_minmax(0,1fr)]",
        )}
      >
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-ctl focus:bg-paper focus:px-3 focus:py-2 focus:text-ink focus:shadow-lg">
          Skip to content
        </a>

        {/* Rail / sidebar (≥ lg). lg–xl: icon rail whose toggle opens the full
            sidebar as an overlay; ≥ xl: full sidebar that can be pinned to the rail. */}
        <aside className="sticky top-0 z-40 hidden h-dvh border-r border-hairline bg-paper lg:block">
          <div className="h-full xl:hidden">
            <SidebarNav
              items={items}
              counts={counts}
              user={shellUser}
              sageOnline={sageOnline}
              collapsed
              pinnedCollapsed
              onTogglePin={() => setRailOpen(true)}
            />
          </div>
          <div className="hidden h-full xl:block">
            <SidebarNav
              items={items}
              counts={counts}
              user={shellUser}
              sageOnline={sageOnline}
              collapsed={pinnedCollapsed}
              pinnedCollapsed={pinnedCollapsed}
              onTogglePin={togglePin}
            />
          </div>
        </aside>

        {/* Overlay sidebar (lg–xl) */}
        <AnimatePresence>
          {railOpen && (
            <div className="fixed inset-0 z-50 hidden lg:block xl:hidden" role="dialog" aria-modal="true" aria-label="Menu">
              <motion.div
                className="absolute inset-0 bg-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setRailOpen(false)}
              />
              <motion.aside
                className="absolute left-0 top-0 h-full w-[248px] border-r border-hairline bg-paper shadow-2xl"
                initial={{ x: -180, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -180, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <SidebarNav
                  items={items}
                  counts={counts}
                  user={shellUser}
                  sageOnline={sageOnline}
                  pinnedCollapsed
                  onNavigate={() => setRailOpen(false)}
                  onTogglePin={() => setRailOpen(false)}
                />
              </motion.aside>
            </div>
          )}
        </AnimatePresence>

        {/* Drawer (< lg) */}
        <AnimatePresence>
          {mobileOpen && (
            <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
              <motion.div
                className="absolute inset-0 bg-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileOpen(false)}
              />
              <motion.aside
                className="absolute left-0 top-0 h-full w-[min(290px,86vw)] border-r border-hairline bg-paper shadow-2xl"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                <SidebarNav
                  items={items}
                  counts={counts}
                  user={shellUser}
                  sageOnline={sageOnline}
                  onNavigate={() => setMobileOpen(false)}
                  onClose={() => setMobileOpen(false)}
                />
              </motion.aside>
            </div>
          )}
        </AnimatePresence>

        <div className="flex min-h-dvh min-w-0 flex-col">
          <AdminTopbar onMenuClick={() => setMobileOpen(true)} user={user} />
          <main id="main" className="w-full min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pb-10">
            <div className="mx-auto w-full max-w-[1320px]">{children}</div>
          </main>
        </div>

        {/* Bottom bar (< lg) */}
        <nav
          aria-label="Quick navigation"
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-hairline bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
        >
          {bottom.map((item) => {
            const active = isNavActive(item.href, pathname);
            const Icon = item.icon;
            const n = item.badge ? counts[item.badge] ?? 0 : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "text-accent" : "text-muted hover:text-ink",
                )}
              >
                <span className="relative">
                  <Icon className="size-5" />
                  {n > 0 && (
                    <span
                      className={cn(
                        "absolute -right-2.5 -top-1.5 min-w-4 rounded-full px-1 text-center text-[10px] font-semibold leading-4 text-white",
                        item.badge === "attention" ? "bg-bad" : "bg-accent",
                      )}
                    >
                      {n > 9 ? "9+" : n}
                    </span>
                  )}
                </span>
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-current={moreActive ? "page" : undefined}
            className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", moreActive ? "text-accent" : "text-muted")}
          >
            <MoreHorizontal className="size-5" />
            More
          </button>
        </nav>

        <InstallPrompt />
        <CommandPalette items={items} />
        <SageFab />
      </div>
    </TourProvider>
  );
}
