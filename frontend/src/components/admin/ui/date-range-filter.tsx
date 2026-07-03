"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type DateRange = { from: string | null; to: string | null };

const iso = (d: Date) => d.toISOString().slice(0, 10);

const PRESETS = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "custom", label: "Custom range" },
] as const;

function computeRange(key: string): DateRange {
  const now = new Date();
  switch (key) {
    case "today":
      return { from: iso(now), to: iso(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      return { from: iso(y), to: iso(y) };
    }
    case "7d": {
      const s = new Date(now);
      s.setDate(now.getDate() - 6);
      return { from: iso(s), to: iso(now) };
    }
    case "30d": {
      const s = new Date(now);
      s.setDate(now.getDate() - 29);
      return { from: iso(s), to: iso(now) };
    }
    case "month":
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
    default:
      return { from: null, to: null };
  }
}

/** Extensive date-range filter: presets + custom range. */
export function DateRangeFilter({ onChange }: { onChange: (r: DateRange) => void }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<string>("all");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [label, setLabel] = useState("All time");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(k: string) {
    setKey(k);
    if (k === "custom") return; // keep open for the date inputs
    setLabel(PRESETS.find((p) => p.key === k)!.label);
    onChange(computeRange(k));
    setOpen(false);
  }

  function applyCustom() {
    onChange({ from: custom.from || null, to: custom.to || null });
    setLabel(custom.from || custom.to ? `${custom.from || "…"} → ${custom.to || "…"}` : "Custom");
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline bg-paper px-3 text-sm font-medium text-ink transition-colors hover:bg-surface"
      >
        <CalendarDays className="size-4 text-muted" />
        <span className="max-w-[9rem] truncate">{label}</span>
        <ChevronDown className="size-3.5 text-muted" />
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1.5 w-56 rounded-xl border border-hairline bg-paper p-1.5 shadow-xl shadow-black/10">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => pick(p.key)}
              className={cn(
                "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-surface",
                key === p.key ? "font-semibold text-brand" : "text-ink",
              )}
            >
              {p.label}
            </button>
          ))}
          {key === "custom" && (
            <div className="mt-1 space-y-2 border-t border-hairline p-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-body">From</label>
                <input
                  type="date"
                  value={custom.from}
                  onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-hairline bg-paper px-2 text-sm text-ink outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-body">To</label>
                <input
                  type="date"
                  value={custom.to}
                  onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                  className="h-9 w-full rounded-lg border border-hairline bg-paper px-2 text-sm text-ink outline-none focus:border-brand"
                />
              </div>
              <button
                type="button"
                onClick={applyCustom}
                className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
