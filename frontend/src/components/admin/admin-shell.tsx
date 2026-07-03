"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SidebarNav } from "./admin-sidebar";
import { AdminTopbar, type AdminUser } from "./admin-topbar";
import { InstallPrompt } from "./install-prompt";
import type { NotificationItem } from "@/lib/db/queries/notifications";
import { cn } from "@/lib/utils";

/**
 * Admin shell: collapsible desktop rail with hover-to-expand (a temporary
 * overlay) and a pin toggle (persists collapsed/expanded), mobile drawer,
 * topbar and the PWA install prompt (only shown inside the dashboard).
 */
export function AdminShell({
  user,
  notifications,
  children,
}: {
  user: AdminUser;
  notifications: NotificationItem[];
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);
  const [hoverExpand, setHoverExpand] = useState(false);

  useEffect(() => {
    try {
      setPinnedCollapsed(localStorage.getItem("litch:sidebar-collapsed") === "1");
    } catch {}
  }, []);

  function togglePin() {
    setPinnedCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("litch:sidebar-collapsed", next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  const collapsed = pinnedCollapsed && !hoverExpand;

  return (
    <div className={cn("min-h-screen bg-cloud lg:grid", pinnedCollapsed ? "lg:grid-cols-[4rem_1fr]" : "lg:grid-cols-[16rem_1fr]")}>
      {/* Desktop rail — hover-expands as an overlay when pinned-collapsed */}
      <aside
        onMouseEnter={() => pinnedCollapsed && setHoverExpand(true)}
        onMouseLeave={() => setHoverExpand(false)}
        className="sticky top-0 z-40 hidden h-screen lg:block"
      >
        <div
          className={cn(
            "h-full border-r border-hairline bg-paper transition-[width] duration-200",
            collapsed ? "w-16" : "w-64",
            pinnedCollapsed && hoverExpand && "absolute left-0 top-0 w-64 shadow-2xl shadow-black/15",
          )}
        >
          <SidebarNav collapsed={collapsed} pinnedCollapsed={pinnedCollapsed} onTogglePin={togglePin} />
        </div>
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-night/50 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="absolute left-0 top-0 h-full w-72 border-r border-hairline bg-paper"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <SidebarNav onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Main column */}
      <div className="flex min-h-screen min-w-0 flex-col">
        <AdminTopbar onMenuClick={() => setMobileOpen(true)} user={user} notifications={notifications} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>

      <InstallPrompt />
    </div>
  );
}
