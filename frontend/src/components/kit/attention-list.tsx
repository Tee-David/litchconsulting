"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  CalendarClock,
  Eye,
  FileText,
  Landmark,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Send,
  Upload,
  UserPlus,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/admin/ui/toaster";
import { EmptyState } from "./empty-state";

/* ──────────────────────────────────────────────────────────────────────────
 * "What needs you" — the home of every dashboard (admin, staff, client).
 * Items are built on the server from real data (see lib/attention/*), sorted
 * worst first. Each row has ONE primary action: a link, or a server action
 * looked up by `actionId` in the `actions` prop. Server actions remove the row
 * optimistically, then offer Undo when the action returns an undo id.
 * ────────────────────────────────────────────────────────────────────────── */

export type AttentionIcon =
  | "bank" | "invoice" | "reply" | "review" | "send" | "assign" | "upload"
  | "mail" | "pay" | "approve" | "alert" | "calendar" | "bell";

export type AttentionItem = {
  id: string;
  group: string; // e.g. "Money" | "Clients" | "Work" — becomes a filter chip
  severity: 1 | 2 | 3; // 3 = worst (red), 2 = soon (amber), 1 = info (blue)
  icon: AttentionIcon;
  title: string;
  detail?: string;
  when?: string; // "Due 23 Oct", "12 min ago"
  whenTone?: "bad" | "warn" | "muted";
  amount?: string; // pre-formatted, e.g. "₦737,500"
  primary: { label: string; href?: string; actionId?: string };
  more?: Array<{ label: string; href?: string; actionId?: string; tone?: "danger" }>;
};

export type AttentionActionResult = { ok: true; undoId?: string; message?: string } | { ok: false; error: string };
export type AttentionAction = (itemId: string) => Promise<AttentionActionResult>;

const ICONS: Record<AttentionIcon, ReactNode> = {
  bank: <Landmark />, invoice: <FileText />, reply: <MessageSquare />, review: <Eye />,
  send: <Send />, assign: <UserPlus />, upload: <Upload />, mail: <Mail />, pay: <Wallet />,
  approve: <BadgeCheck />, alert: <AlertTriangle />, calendar: <CalendarClock />, bell: <Bell />,
};

const SEV = {
  3: { bar: "bg-bad", icon: "bg-bad-soft text-bad" },
  2: { bar: "bg-warn", icon: "bg-warn-soft text-warn" },
  1: { bar: "bg-info", icon: "bg-info-soft text-info" },
} as const;

const SNOOZE_KEY = "litch.attention.snooze";
function readSnoozed(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(SNOOZE_KEY) || "{}") as Record<string, number>;
    const now = Date.now();
    return Object.fromEntries(Object.entries(raw).filter(([, until]) => until > now));
  } catch {
    return {};
  }
}

export function AttentionList({
  items,
  actions = {},
  undo,
  title = "What needs you",
  emptyTitle = "You're all caught up",
  emptyWhy = "Nothing is waiting on you right now. New items appear here the moment they need a decision.",
  emptyAction,
}: {
  items: AttentionItem[];
  actions?: Record<string, AttentionAction>;
  undo?: (undoId: string) => Promise<AttentionActionResult>;
  title?: string;
  emptyTitle?: string;
  emptyWhy?: string;
  emptyAction?: ReactNode;
}) {
  const toast = useToast();
  const [group, setGroup] = useState<string>("all");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});
  useEffect(() => setSnoozed(readSnoozed()), []);

  const live = useMemo(
    () =>
      items
        .filter((i) => !hidden.has(i.id) && !snoozed[i.id])
        .sort((a, b) => b.severity - a.severity),
    [items, hidden, snoozed],
  );
  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of live) m.set(i.group, (m.get(i.group) ?? 0) + 1);
    return [...m.entries()];
  }, [live]);
  const shown = group === "all" ? live : live.filter((i) => i.group === group);

  const runAction = async (item: AttentionItem, actionId: string) => {
    const fn = actions[actionId];
    if (!fn) return;
    setBusy(item.id);
    setHidden((h) => new Set(h).add(item.id)); // optimistic
    try {
      const res = await fn(item.id);
      if (!res.ok) {
        setHidden((h) => {
          const n = new Set(h);
          n.delete(item.id);
          return n;
        });
        toast.error(res.error);
        return;
      }
      if (res.undoId && undo) {
        const undoId = res.undoId;
        toast.action(res.message ?? "Done", {
          label: "Undo",
          onAction: async () => {
            const u = await undo(undoId);
            if (u.ok) {
              setHidden((h) => {
                const n = new Set(h);
                n.delete(item.id);
                return n;
              });
            } else toast.error(u.error);
          },
        });
      } else {
        toast.success(res.message ?? "Done");
      }
    } catch {
      setHidden((h) => {
        const n = new Set(h);
        n.delete(item.id);
        return n;
      });
      toast.error("That did not work. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const snooze = (item: AttentionItem) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);
    const next = { ...readSnoozed(), [item.id]: tomorrow.getTime() };
    try {
      localStorage.setItem(SNOOZE_KEY, JSON.stringify(next));
    } catch {
      /* not persisted in private mode — still hidden for this visit */
    }
    setSnoozed(next);
    toast.action("Snoozed until tomorrow 08:00", {
      label: "Undo",
      onAction: () => {
        const rest = { ...readSnoozed() };
        delete rest[item.id];
        try {
          localStorage.setItem(SNOOZE_KEY, JSON.stringify(rest));
        } catch {
          /* ignore */
        }
        setSnoozed(rest);
      },
    });
  };

  return (
    <section aria-labelledby="attention-title" className="rounded-card border border-hairline bg-paper">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-3 sm:px-5">
        <h2 id="attention-title" className="font-display text-base font-semibold text-ink">
          {title}
          <span className="ml-2 text-sm font-normal text-muted">
            {live.length === 0 ? "nothing waiting" : `${live.length} ${live.length === 1 ? "thing" : "things"}, worst first`}
          </span>
        </h2>
        {groups.length > 1 ? (
          <div role="tablist" aria-label="Filter what needs you" className="-mx-1 flex gap-1 overflow-x-auto px-1 sm:ml-auto">
            {[["all", live.length] as const, ...groups].map(([g, n]) => (
              <button
                key={g}
                role="tab"
                type="button"
                aria-selected={group === g}
                onClick={() => setGroup(g)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium",
                  group === g ? "border-transparent bg-act text-act-ink" : "border-hairline text-body hover:text-ink",
                )}
              >
                {g === "all" ? "All" : g}
                <span className="tabular-nums text-xs opacity-75">{n}</span>
              </button>
            ))}
          </div>
        ) : null}
      </header>

      {shown.length === 0 ? (
        <EmptyState compact icon={<BadgeCheck />} title={emptyTitle} why={emptyWhy} action={emptyAction} />
      ) : (
        <ul className="divide-y divide-hairline">
          {shown.map((item) => (
            <Row
              key={item.id}
              item={item}
              busy={busy === item.id}
              onAction={(id) => runAction(item, id)}
              onSnooze={() => snooze(item)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({
  item,
  busy,
  onAction,
  onSnooze,
}: {
  item: AttentionItem;
  busy: boolean;
  onAction: (actionId: string) => void;
  onSnooze: () => void;
}) {
  const sev = SEV[item.severity];
  const primaryCls = cn(
    "inline-flex h-9 shrink-0 items-center justify-center rounded-ctl px-3.5 text-sm font-semibold transition-colors",
    item.severity === 3 ? "bg-act text-act-ink hover:bg-act-hover" : "border border-line-strong bg-paper text-ink hover:bg-surface",
  );
  return (
    <li className="relative flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
      <span aria-hidden className={cn("absolute inset-y-3 left-0 w-1 rounded-r-full", sev.bar)} />
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-ctl [&_svg]:size-[18px]", sev.icon)}>
          {ICONS[item.icon]}
        </span>
        <div className="min-w-0">
          <p className="font-medium text-ink">{item.title}</p>
          {item.detail ? <p className="mt-0.5 text-sm text-body">{item.detail}</p> : null}
        </div>
      </div>
      <div className="flex items-center gap-3 pl-12 sm:pl-0">
        {item.when || item.amount ? (
          <div className="mr-auto text-right text-sm sm:mr-0">
            {item.when ? (
              <p className={cn(item.whenTone === "bad" ? "font-medium text-bad" : item.whenTone === "warn" ? "text-warn" : "text-muted")}>
                {item.when}
              </p>
            ) : null}
            {item.amount ? <p className="font-semibold tabular-nums text-ink">{item.amount}</p> : null}
          </div>
        ) : null}
        {item.primary.href ? (
          <Link href={item.primary.href} className={primaryCls}>
            {item.primary.label}
          </Link>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => item.primary.actionId && onAction(item.primary.actionId)}
            className={cn(primaryCls, "disabled:opacity-60")}
          >
            {busy ? "Working…" : item.primary.label}
          </button>
        )}
        <MoreMenu item={item} onAction={onAction} onSnooze={onSnooze} />
      </div>
    </li>
  );
}

function MoreMenu({ item, onAction, onSnooze }: { item: AttentionItem; onAction: (id: string) => void; onSnooze: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={`More actions for ${item.title}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-9 place-items-center rounded-ctl text-muted hover:bg-surface hover:text-ink"
      >
        <MoreHorizontal className="size-5" />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-56 rounded-ctl border border-hairline bg-paper p-1 shadow-lg">
          {(item.more ?? []).map((m) =>
            m.href ? (
              <Link
                key={m.label}
                role="menuitem"
                href={m.href}
                className={cn("block rounded-lg px-3 py-2 text-sm hover:bg-surface", m.tone === "danger" ? "text-bad" : "text-ink")}
              >
                {m.label}
              </Link>
            ) : (
              <button
                key={m.label}
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (m.actionId) onAction(m.actionId);
                }}
                className={cn("block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface", m.tone === "danger" ? "text-bad" : "text-ink")}
              >
                {m.label}
              </button>
            ),
          )}
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              onSnooze();
            }}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-surface"
          >
            Snooze until tomorrow
          </button>
        </div>
      ) : null}
    </div>
  );
}
