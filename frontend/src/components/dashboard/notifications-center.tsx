"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { Button, EmptyState, Segmented } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { cn } from "@/lib/utils";
import { markReadAction, setPrefAction, setWeeklySummaryAction } from "@/app/dashboard/notifications/actions";
import { PushSwitch } from "./push-switch";

export type CenterItem = {
  id: string;
  category: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};
export type CenterPref = { category: string; label: string; hint: string; mode: "immediate" | "digest" | "off"; email: boolean; push: boolean; lockOff?: boolean };

const CAT_LABEL: Record<string, string> = { actions: "Actions", progress: "Progress", billing: "Billing", support: "Support", team: "Team" };

function when(iso: string) {
  return new Date(iso).toLocaleString("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
function bucket(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : days < 7 ? "This week" : "Earlier";
}

export function NotificationsCenter({
  items: initial,
  prefs: initialPrefs,
  tab: initialTab,
  weeklySummary,
}: {
  items: CenterItem[];
  prefs: CenterPref[];
  tab: "list" | "prefs";
  /** Clients only: the weekly summary email toggle (null hides the row). */
  weeklySummary: boolean | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [pending, start] = useTransition();
  const unread = items.filter((i) => !i.read).length;
  const shown = filter === "unread" ? items.filter((i) => !i.read) : items;
  const groups = useMemo(() => {
    const m = new Map<string, CenterItem[]>();
    for (const i of shown) m.set(bucket(i.createdAt), [...(m.get(bucket(i.createdAt)) ?? []), i]);
    return [...m.entries()];
  }, [shown]);

  const mark = (ids?: string[]) => {
    const before = items;
    setItems((xs) => xs.map((x) => (!ids || ids.includes(x.id) ? { ...x, read: true } : x)));
    start(async () => {
      const r = await markReadAction(ids);
      if (!r.ok) {
        setItems(before);
        toast.error(r.error);
      } else if (!ids) toast.success("All marked read");
      router.refresh();
    });
  };

  return (
    <div>
      <div role="tablist" aria-label="Notifications" className="mb-5 flex gap-1 border-b border-hairline">
        {(
          [
            ["list", `All${unread ? ` · ${unread} unread` : ""}`],
            ["prefs", "Preferences"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            id={`tab-${id}`}
            data-tour={`notif-${id}`}
            onClick={() => {
              setTab(id);
              const u = new URL(window.location.href);
              u.searchParams.set("tab", id);
              window.history.replaceState(null, "", u);
            }}
            className={cn("relative h-11 px-3 text-sm font-medium", tab === id ? "text-ink" : "text-muted hover:text-ink")}
          >
            {label}
            {tab === id ? <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-act" /> : null}
          </button>
        ))}
      </div>

      {tab === "list" ? (
        <section id="panel-list" role="tabpanel" aria-labelledby="tab-list" className="rounded-card border border-hairline bg-paper">
          <header className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-3 sm:px-5">
            <Segmented
              label="Show"
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: items.length },
                { value: "unread", label: "Unread", count: unread },
              ]}
            />
            <Button size="sm" className="ml-auto" disabled={!unread || pending} onClick={() => mark()}>
              <CheckCheck className="size-4" aria-hidden /> Mark all read
            </Button>
          </header>
          {shown.length === 0 ? (
            <EmptyState
              icon={<Bell />}
              title={filter === "unread" ? "Nothing unread" : "No notifications yet"}
              why={filter === "unread" ? "You have read everything. Switch to All to see the history." : "When something happens on your work (a quote, a draft, a reply), it shows up here and in the bell."}
            />
          ) : (
            groups.map(([g, list]) => (
              <div key={g}>
                <p className="px-4 pb-1 pt-4 text-xs font-medium text-muted sm:px-5">{g}</p>
                <ul className="divide-y divide-hairline">
                  {list.map((n) => {
                    const body = (
                      <>
                        <span aria-hidden className={cn("mt-2 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-act")} />
                        <span className="min-w-0 flex-1">
                          <span className={cn("block text-sm text-ink", !n.read && "font-semibold")}>{n.title}</span>
                          {n.body ? <span className="mt-0.5 block text-sm text-body">{n.body}</span> : null}
                          <span className="mt-1 block text-xs text-muted">{when(n.createdAt)}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs text-body">{CAT_LABEL[n.category] ?? n.category}</span>
                      </>
                    );
                    return (
                      <li key={n.id}>
                        {n.link ? (
                          <Link
                            href={n.link}
                            onClick={() => !n.read && mark([n.id])}
                            className={cn("flex gap-3 px-4 py-3 hover:bg-surface sm:px-5", !n.read && "bg-brand-tint/40")}
                          >
                            {body}
                          </Link>
                        ) : (
                          <button type="button" onClick={() => !n.read && mark([n.id])} className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-surface sm:px-5", !n.read && "bg-brand-tint/40")}>
                            {body}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </section>
      ) : (
        <div id="panel-prefs" role="tabpanel" aria-labelledby="tab-prefs" className="space-y-4">
          <Prefs initial={initialPrefs} />
          <section className="rounded-card border border-hairline bg-paper px-4 py-4 sm:px-5">
            <h2 className="font-display text-base font-semibold text-ink">This device</h2>
            <p className="mt-1 text-sm text-body">Push notifications pop up on this phone or computer even when the site is closed.</p>
            <div className="mt-3">
              <PushSwitch />
            </div>
          </section>
          {weeklySummary !== null ? <WeeklySummary initial={weeklySummary} /> : null}
        </div>
      )}
    </div>
  );
}

function Prefs({ initial }: { initial: CenterPref[] }) {
  const toast = useToast();
  const [prefs, setPrefs] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const save = async (next: CenterPref) => {
    const before = prefs;
    setPrefs((ps) => ps.map((p) => (p.category === next.category ? next : p)));
    setBusy(next.category);
    const r = await setPrefAction({ category: next.category as never, mode: next.mode, email: next.email, push: next.push });
    setBusy(null);
    if (!r.ok) {
      setPrefs(before);
      toast.error(r.error);
    } else toast.success(`${next.label}: saved`);
  };

  return (
    <section className="rounded-card border border-hairline bg-paper">
      <header className="border-b border-hairline px-4 py-3 sm:px-5">
        <h2 className="font-display text-base font-semibold text-ink">How you hear from us</h2>
        <p className="mt-0.5 text-sm text-body">
          Right away sends email and push now. Daily digest sends one email at 08:00. Off keeps it in the bell only. The bell always shows everything.
        </p>
      </header>
      <ul className="divide-y divide-hairline">
        {prefs.map((p) => {
          const off = p.mode !== "immediate";
          return (
            <li key={p.category} className="grid gap-3 px-4 py-4 sm:px-5 md:grid-cols-[1fr_auto_auto] md:items-center md:gap-6">
              <div>
                <p className="font-medium text-ink">{p.label}</p>
                <p className="text-sm text-body">{p.hint}</p>
              </div>
              <div className={cn(busy === p.category && "opacity-60")}>
                <Segmented
                  label={`${p.label}: how often`}
                  size="sm"
                  value={p.mode}
                  onChange={(mode) => {
                    if (mode === "off" && p.lockOff) {
                      toast.error("Actions can be a daily digest, but not off: some need you by a date.");
                      return;
                    }
                    void save({ ...p, mode });
                  }}
                  options={[
                    { value: "immediate", label: "Right away" },
                    { value: "digest", label: "Daily digest" },
                    { value: "off", label: "Off" },
                  ]}
                />
              </div>
              <div className="flex gap-4">
                <Toggle label="Email" checked={p.email} disabled={off || busy === p.category} onChange={(email) => void save({ ...p, email })} />
                <Toggle label="Push" checked={p.push} disabled={off || busy === p.category} onChange={(push) => void save({ ...p, push })} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function WeeklySummary({ initial }: { initial: boolean }) {
  const toast = useToast();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <section className="flex flex-col gap-3 rounded-card border border-hairline bg-paper px-4 py-4 sm:flex-row sm:items-center sm:px-5">
      <div className="flex-1">
        <h2 className="font-display text-base font-semibold text-ink">Weekly summary</h2>
        <p className="mt-0.5 text-sm text-body">A Monday email with where each of your requests stands and anything due that week.</p>
      </div>
      <Toggle
        label={on ? "On" : "Off"}
        checked={on}
        disabled={busy}
        onChange={async (v) => {
          setOn(v);
          setBusy(true);
          const r = await setWeeklySummaryAction(v);
          setBusy(false);
          if (!r.ok) {
            setOn(!v);
            toast.error(r.error);
          } else toast.success(v ? "Weekly summary on" : "Weekly summary off");
        }}
      />
    </section>
  );
}

export function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm text-body", disabled && "cursor-not-allowed opacity-50")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40",
          checked ? "bg-act" : "bg-line-strong",
        )}
      >
        <span aria-hidden className={cn("absolute top-0.5 size-5 rounded-full bg-paper shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
      </button>
      {label}
    </label>
  );
}
