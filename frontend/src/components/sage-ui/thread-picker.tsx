"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type ThreadItem = { id: string; title: string; at?: string | null; questions?: number };

function groupOf(at?: string | null): string {
  if (!at) return "Earlier";
  const d = new Date(at);
  const today = new Date();
  const days = Math.floor((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Last 7 days";
  return "Earlier";
}

/**
 * "Sage · <chat title> ▾": opens the chat list with search, grouped by day. The open
 * chat is first in its group. Used in the workbench panel and the floating widget.
 */
export function ThreadPicker({
  current,
  threads,
  onPick,
  disabled,
}: {
  current: ThreadItem;
  threads: ThreadItem[];
  onPick: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  const groups = useMemo(() => {
    const all = [current, ...threads.filter((t) => t.id !== current.id)];
    const hit = all.filter((t) => !q.trim() || t.title.toLowerCase().includes(q.trim().toLowerCase()));
    const out: [string, ThreadItem[]][] = [];
    for (const t of hit) {
      const g = t.id === current.id ? "Open now" : groupOf(t.at);
      const row = out.find(([n]) => n === g);
      if (row) row[1].push(t);
      else out.push([g, [t]]);
    }
    return out;
  }, [current, threads, q]);

  return (
    <div ref={box} className="relative min-w-0 flex-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((o) => !o);
          setQ("");
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Chat history"
        className="flex min-h-9 w-full min-w-0 items-center gap-1.5 rounded-lg px-2 text-left hover:bg-surface disabled:opacity-50"
      >
        <span className="text-[14px] font-semibold text-ink">Sage</span>
        <span className="min-w-0 truncate text-[12.5px] text-muted">{current.title}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div role="dialog" aria-label="Chat history" className="absolute left-0 top-full z-40 mt-1 flex max-h-[min(420px,60vh)] w-[min(340px,calc(100vw-32px))] flex-col rounded-xl border border-hairline bg-paper shadow-lg">
          <label className="m-2 flex min-h-9 items-center gap-2 rounded-ctl bg-surface px-2.5 text-muted">
            <Search className="size-3.5" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search chats"
              aria-label="Search chats"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none"
            />
          </label>
          <div className="overflow-y-auto px-1.5 pb-2">
            {groups.length === 0 ? <p className="px-2 py-3 text-[13px] text-muted">No chats match.</p> : null}
            {groups.map(([g, items]) => (
              <div key={g}>
                <p className="px-2 pb-1 pt-2.5 text-[11.5px] text-muted">{g}</p>
                {items.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-current={t.id === current.id}
                    onClick={() => {
                      setOpen(false);
                      if (t.id !== current.id) onPick(t.id);
                    }}
                    className="flex w-full flex-col items-start rounded-lg px-2 py-1.5 text-left hover:bg-surface aria-[current=true]:bg-brand-tint"
                  >
                    <span className="max-w-full truncate text-[13px] text-ink">{t.title}</span>
                    <span className="text-[11.5px] text-muted">
                      {t.at ? new Date(t.at).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "No questions yet"}
                      {t.questions ? ` · ${t.questions} question${t.questions === 1 ? "" : "s"}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
