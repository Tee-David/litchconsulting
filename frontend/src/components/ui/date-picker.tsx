"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Material-style single date picker — a styled trigger + a calendar popover,
 * matching the house `Select` (no browser-native `<input type=date>`). Value is
 * an ISO `yyyy-mm-dd` string so it round-trips to the DB and server actions
 * cleanly. No date library; all math is local-time day arithmetic.
 */

// Monday-first, matching the design samples.
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fromISO(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
function fmt(d: Date): string {
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Select a date",
  disabled = false,
  max,
  min,
  invalid = false,
  ariaLabel,
}: {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  disabled?: boolean;
  max?: string;
  min?: string;
  invalid?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = fromISO(value);
  const [view, setView] = useState<Date>(() => selected ?? new Date());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && selected) setView(selected);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const maxD = max ? fromISO(max) : null;
  const minD = min ? fromISO(min) : null;
  const today = new Date();
  const todayISO = toISO(today);

  const y = view.getFullYear();
  const mo = view.getMonth();
  // Monday-first: shift JS's Sunday=0 so Monday leads the row.
  const firstDay = (new Date(y, mo, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(y, mo, i + 1)),
  ];

  const disabledDay = (d: Date) =>
    (maxD ? d > maxD : false) || (minD ? d < minD : false);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-2 rounded-xl border bg-paper px-3.5 py-2.5 text-left text-sm outline-none transition-colors disabled:opacity-50",
          invalid ? "border-red-400 ring-1 ring-red-400/40" : "border-hairline",
          open && !invalid && "border-brand ring-2 ring-brand/15",
        )}
      >
        <Calendar className="size-4 shrink-0 text-muted" />
        <span className={cn("flex-1 truncate", selected ? "text-ink" : "text-muted")}>
          {selected ? fmt(selected) : placeholder}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-2 w-[min(19rem,calc(100vw-2rem))] rounded-xl border border-hairline bg-paper p-3 shadow-xl shadow-black/10">
          {/* Month nav */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setView(new Date(y, mo - 1, 1))}
              aria-label="Previous month"
              className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-sm font-semibold text-ink">
              {MONTHS[mo]} {y}
            </span>
            <button
              type="button"
              onClick={() => setView(new Date(y, mo + 1, 1))}
              aria-label="Next month"
              className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {/* Weekday header */}
          <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[11px] font-medium text-muted">
            {WEEKDAYS.map((w) => (
              <span key={w} className="py-1">
                {w}
              </span>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) =>
              d === null ? (
                <span key={`e${i}`} />
              ) : (
                (() => {
                  const iso = toISO(d);
                  const isSel = value === iso;
                  const isToday = iso === todayISO;
                  const off = disabledDay(d);
                  return (
                    <button
                      key={iso}
                      type="button"
                      disabled={off}
                      onClick={() => {
                        onChange(iso);
                        setOpen(false);
                      }}
                      className={cn(
                        "relative mx-auto grid size-9 place-items-center rounded-full text-sm tabular-nums transition-colors",
                        off && "cursor-not-allowed text-muted/40",
                        !off && !isSel && "text-ink hover:bg-surface",
                        isSel && "bg-brand font-semibold text-white",
                        !isSel && isToday && "font-semibold text-brand",
                      )}
                    >
                      {d.getDate()}
                      {isToday && !isSel && (
                        <span className="absolute bottom-1 size-1 rounded-full bg-brand" />
                      )}
                    </button>
                  );
                })()
              ),
            )}
          </div>

          {/* Quick actions */}
          <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2">
            <button
              type="button"
              onClick={() => {
                onChange(todayISO);
                setOpen(false);
              }}
              className="rounded-lg px-2 py-1 text-xs font-medium text-brand hover:bg-brand-tint"
            >
              Today
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-surface hover:text-ink"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
