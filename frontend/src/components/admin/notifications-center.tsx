"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { Button, EmptyState, Segmented } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { markReadAction, savePrefAction } from "@/app/admin/notifications/actions";
import { cn } from "@/lib/utils";

export type NoteItem = { id: string; category: string; title: string; body: string | null; link: string | null; read: boolean; createdAt: string };
export type PrefRow = { category: string; label: string; hint: string; mode: "immediate" | "digest" | "off"; email: boolean; push: boolean };

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function NotificationList({ items, labels }: { items: NoteItem[]; labels: Record<string, string> }) {
  const router = useRouter();
  const toast = useToast();
  const [cat, setCat] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const shown = useMemo(() => items.filter((i) => (cat === "all" || i.category === cat) && (!unreadOnly || !i.read)), [items, cat, unreadOnly]);
  const unread = items.filter((i) => !i.read).length;
  const cats = [...new Set(items.map((i) => i.category))];

  const open = async (n: NoteItem) => {
    if (!n.read) await markReadAction([n.id]);
    if (n.link) router.push(n.link);
    else router.refresh();
  };

  return (
    <section className="rounded-card border border-hairline bg-paper">
      <header className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3 sm:px-5">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {["all", ...cats].map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={cat === c}
              onClick={() => setCat(c)}
              className={cn("shrink-0 rounded-full border px-3 py-1 text-sm font-medium", cat === c ? "keep-brand border-transparent bg-act text-act-ink" : "border-hairline text-body hover:text-ink")}
            >
              {c === "all" ? "All" : labels[c] ?? c}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm text-body">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /> Unread only
        </label>
        <Button
          size="sm"
          disabled={unread === 0}
          onClick={async () => {
            const r = await markReadAction();
            if (r.ok) {
              toast.success("All marked read.");
              router.refresh();
            } else toast.error(r.error);
          }}
        >
          <CheckCheck className="size-4" /> Mark all read
        </Button>
      </header>
      {shown.length === 0 ? (
        <EmptyState compact icon={<Bell />} title={items.length ? "Nothing in this filter" : "No notifications yet"} why={items.length ? "Try All, or turn off Unread only." : "Transfers to confirm, client replies, failed emails and new requests will show here as they happen."} />
      ) : (
        <ul className="divide-y divide-hairline">
          {shown.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => open(n)} className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-surface sm:px-5", !n.read && "bg-brand-tint/50")}>
                <span aria-hidden className={cn("mt-2 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-accent")} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{n.title}</span>
                  {n.body ? <span className="mt-0.5 block whitespace-pre-line text-sm text-body">{n.body}</span> : null}
                  <span className="mt-1 block text-xs text-muted">
                    {labels[n.category] ?? n.category} · {when(n.createdAt)}
                    {!n.read ? <span className="sr-only"> (unread)</span> : null}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PrefsMatrix({ prefs }: { prefs: PrefRow[] }) {
  const toast = useToast();
  const [rows, setRows] = useState(prefs);
  const [saving, setSaving] = useState<string | null>(null);
  const save = async (next: PrefRow) => {
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.category === next.category ? next : r)));
    setSaving(next.category);
    const r = await savePrefAction({ category: next.category as never, mode: next.mode, email: next.email, push: next.push });
    setSaving(null);
    if (!r.ok) {
      setRows(prev);
      toast.error(r.error);
    } else toast.success(`Saved: ${next.label}`);
  };
  return (
    <section id="prefs" className="rounded-card border border-hairline bg-paper">
      <header className="border-b border-hairline px-4 py-3 sm:px-5">
        <h2 className="font-display text-[15px] font-semibold text-ink">What you hear about, and how</h2>
        <p className="text-sm text-body">The bell always keeps a copy. Daily digest sends one email a day instead of one per event.</p>
      </header>
      <ul className="divide-y divide-hairline">
        {rows.map((p) => (
          <li key={p.category} className="flex flex-col gap-3 px-4 py-3.5 sm:px-5 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink">{p.label}</p>
              <p className="text-sm text-body">{p.hint}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3" aria-busy={saving === p.category}>
              <Segmented
                size="sm"
                label={`${p.label}: when`}
                value={p.mode}
                onChange={(mode) => save({ ...p, mode })}
                options={[
                  { value: "immediate", label: "Right away" },
                  { value: "digest", label: "Daily digest" },
                  { value: "off", label: "Bell only" },
                ]}
              />
              <label className={cn("flex items-center gap-1.5 text-sm", p.mode === "off" ? "text-faint" : "text-body")}>
                <input type="checkbox" disabled={p.mode === "off"} checked={p.email} onChange={(e) => save({ ...p, email: e.target.checked })} /> Email
              </label>
              <label className={cn("flex items-center gap-1.5 text-sm", p.mode !== "immediate" ? "text-faint" : "text-body")}>
                <input type="checkbox" disabled={p.mode !== "immediate"} checked={p.push} onChange={(e) => save({ ...p, push: e.target.checked })} /> Push
              </label>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
