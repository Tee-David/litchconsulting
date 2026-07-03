"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SidebarNav } from "./admin-sidebar";
import { AdminTopbar, type AdminUser } from "./admin-topbar";

/** Admin layout shell: fixed desktop rail, mobile drawer, topbar. */
export function AdminShell({ user, children }: { user: AdminUser; children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-cloud lg:grid lg:grid-cols-[16rem_1fr]">
        {/* Desktop rail */}
        <aside className="sticky top-0 hidden h-screen border-r border-hairline bg-paper lg:block">
          <SidebarNav />
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
          <AdminTopbar onMenuClick={() => setMobileOpen(true)} user={user} />
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
  );
}
