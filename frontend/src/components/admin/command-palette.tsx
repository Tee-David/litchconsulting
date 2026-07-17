"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  Loader2,
  Plus,
  Trash2,
  ScrollText,
  FileText,
  Inbox,
  UserPlus,
  Sparkles,
  CornerDownLeft,
  type LucideIcon,
} from "lucide-react";
import { NAV_ITEMS } from "@/components/admin/nav";
import { commandSearch, type CommandHit } from "@/app/admin/command-actions";
import { cn } from "@/lib/utils";

type QuickAction = { label: string; href: string; icon: LucideIcon; keywords?: string };

const QUICK_ACTIONS: QuickAction[] = [
  { label: "New invoice", href: "/admin/finance/invoices/new", icon: FileText, keywords: "create bill" },
  { label: "New request", href: "/request", icon: Inbox, keywords: "create service" },
  { label: "New client", href: "/admin/clients", icon: UserPlus, keywords: "create add" },
  { label: "Ask Copilot", href: "/admin/assistant", icon: Sparkles, keywords: "ai assistant chat knowledge" },
  { label: "Go to Trash", href: "/admin/trash", icon: Trash2, keywords: "deleted" },
  { label: "Go to Audit log", href: "/admin/audit", icon: ScrollText, keywords: "history log" },
];

const RESULT_GROUPS: CommandHit["group"][] = ["Clients", "Requests", "Invoices"];

const itemCls =
  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-body outline-none data-[selected=true]:bg-brand-tint data-[selected=true]:text-ink";

/**
 * ⌘K / Ctrl+K command palette for the admin. Groups: Navigate (every nav item),
 * Quick actions, and a live cross-entity Find (clients / requests / invoices)
 * backed by the isAdmin-guarded commandSearch action. Built on cmdk with a
 * hand-rolled, brand-tokened overlay (shouldFilter=false — static groups are
 * filtered locally, server hits are already matched).
 */
export function CommandPalette() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CommandHit[]>([]);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  useEffect(() => setMounted(true), []);

  // Global toggle.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open]);

  // Reset transient state whenever the palette closes.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setLoading(false);
    }
  }, [open]);

  // Debounced server search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const id = ++reqId.current;
      try {
        const hits = await commandSearch(q);
        if (id === reqId.current) setResults(hits);
      } catch {
        if (id === reqId.current) setResults([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  const ql = query.trim().toLowerCase();
  const navFiltered = NAV_ITEMS.filter((n) => !ql || n.label.toLowerCase().includes(ql));
  const quickFiltered = QUICK_ACTIONS.filter(
    (a) => !ql || a.label.toLowerCase().includes(ql) || a.keywords?.includes(ql),
  );

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[95] flex items-start justify-center p-4 pt-[12vh]">
          <motion.div
            className="absolute inset-0 bg-night/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-hairline bg-paper shadow-2xl shadow-black/25"
          >
            <Command
              shouldFilter={false}
              className="flex max-h-[70vh] flex-col"
              label="Command palette"
            >
              <div className="flex items-center gap-2.5 border-b border-hairline px-4">
                <Search className="size-4 shrink-0 text-muted" />
                <Command.Input
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search clients, requests, invoices — or jump to a page…"
                  className="h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
                />
                {loading && <Loader2 className="size-4 shrink-0 animate-spin text-muted" />}
                <kbd className="hidden shrink-0 rounded border border-hairline px-1.5 py-0.5 text-[10px] font-medium text-muted sm:inline">
                  ESC
                </kbd>
              </div>

              <Command.List className="flex-1 overflow-y-auto p-2">
                <Command.Empty className="px-3 py-8 text-center text-sm text-muted">
                  {loading ? "Searching…" : "No matches. Try a name, number, or page."}
                </Command.Empty>

                {navFiltered.length > 0 && (
                  <Command.Group
                    heading="Navigate"
                    className="px-1 pb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted"
                  >
                    {navFiltered.map((n) => {
                      const Icon = n.icon;
                      return (
                        <Command.Item
                          key={n.href}
                          value={`nav:${n.label}`}
                          onSelect={() => go(n.href)}
                          className={itemCls}
                        >
                          <Icon className="size-4 shrink-0 text-muted" />
                          <span className="flex-1 truncate">{n.label}</span>
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                )}

                {quickFiltered.length > 0 && (
                  <Command.Group
                    heading="Quick actions"
                    className="px-1 pb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted"
                  >
                    {quickFiltered.map((a) => {
                      const Icon = a.icon;
                      return (
                        <Command.Item
                          key={a.href + a.label}
                          value={`quick:${a.label}`}
                          onSelect={() => go(a.href)}
                          className={itemCls}
                        >
                          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-brand-tint text-brand keep-brand">
                            <Icon className="size-3.5" />
                          </span>
                          <span className="flex-1 truncate">{a.label}</span>
                          <Plus className="size-3.5 shrink-0 text-muted" />
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                )}

                {RESULT_GROUPS.map((g) => {
                  const items = results.filter((r) => r.group === g);
                  if (items.length === 0) return null;
                  return (
                    <Command.Group
                      key={g}
                      heading={g}
                      className="px-1 pb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted"
                    >
                      {items.map((r) => (
                        <Command.Item
                          key={r.id}
                          value={`hit:${r.group}:${r.id}`}
                          onSelect={() => go(r.href)}
                          className={itemCls}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-ink">{r.label}</span>
                            {r.sublabel && (
                              <span className="block truncate text-xs text-muted">{r.sublabel}</span>
                            )}
                          </span>
                          <CornerDownLeft className="size-3.5 shrink-0 text-muted opacity-0 group-data-[selected=true]:opacity-100" />
                        </Command.Item>
                      ))}
                    </Command.Group>
                  );
                })}
              </Command.List>

              <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-2.5 text-[11px] text-muted">
                <span className="flex items-center gap-1.5">
                  <CornerDownLeft className="size-3" /> to select
                </span>
                <span className={cn("flex items-center gap-1", "font-medium")}>
                  <kbd className="rounded border border-hairline px-1 py-0.5">⌘</kbd>
                  <kbd className="rounded border border-hairline px-1 py-0.5">K</kbd>
                  to toggle
                </span>
              </div>
            </Command>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
