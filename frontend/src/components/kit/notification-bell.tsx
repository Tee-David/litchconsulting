"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  category: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

function ago(iso: string): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/**
 * The bell for all three shells. Polls every 60 s while the tab is visible,
 * refreshes on open, and marks items read when clicked (or all at once).
 * `allHref` is the full notifications page for the role.
 */
export function NotificationBell({ allHref }: { allHref: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications?limit=15", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const j = (await r.json()) as { unread: number; items: Item[] };
      setItems(j.items);
      setUnread(j.unread);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    const onVis = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const mark = async (ids?: string[]) => {
    setItems((xs) => xs.map((x) => (!ids || ids.includes(x.id) ? { ...x, read: true } : x)));
    setUnread((n) => (ids ? Math.max(0, n - ids.length) : 0));
    try {
      const r = await fetch("/api/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(ids ? { ids } : {}),
      });
      const j = (await r.json()) as { unread?: number };
      if (typeof j.unread === "number") setUnread(j.unread);
    } catch {
      /* next poll corrects the count */
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void load();
        }}
        className="relative grid size-10 place-items-center rounded-ctl border border-hairline bg-paper text-ink hover:bg-surface"
      >
        <Bell className="size-[18px]" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-bad px-1 text-[11px] font-semibold leading-5 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-3 top-16 z-50 overflow-hidden rounded-card border border-hairline bg-paper shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96"
        >
          <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
            <p className="font-display font-semibold text-ink">Notifications</p>
            {unread > 0 ? (
              <button type="button" onClick={() => mark()} className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
                <CheckCheck className="size-4" /> Mark all read
              </button>
            ) : null}
          </header>
          <ul className="max-h-[60vh] divide-y divide-hairline overflow-y-auto">
            {!loaded ? (
              <li className="px-4 py-6 text-center text-sm text-muted">Loading…</li>
            ) : failed && items.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-bad">Couldn&rsquo;t load notifications.</li>
            ) : items.length === 0 ? (
              <li className="px-4 py-8 text-center">
                <p className="font-medium text-ink">No notifications yet</p>
                <p className="mt-1 text-sm text-muted">Updates on your work will appear here.</p>
              </li>
            ) : (
              items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!n.read) void mark([n.id]);
                      setOpen(false);
                      if (n.link) router.push(n.link);
                    }}
                    className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-surface", !n.read && "bg-brand-tint/60")}
                  >
                    <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-accent")} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">{n.title}</span>
                      {n.body ? <span className="mt-0.5 line-clamp-2 block text-sm text-body">{n.body}</span> : null}
                      <span className="mt-1 block text-xs text-muted">{ago(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <footer className="border-t border-hairline px-4 py-2.5 text-center">
            <Link href={allHref} onClick={() => setOpen(false)} className="text-sm font-medium text-accent hover:underline">
              See all and manage notifications
            </Link>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
