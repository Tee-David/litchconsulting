"use client";

import { cn } from "@/lib/utils";

export type Period = "7d" | "30d" | "90d" | "12mo" | "ytd";

const OPTIONS: { value: Period; label: string }[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "12mo", label: "12mo" },
  { value: "ytd", label: "YTD" },
];

/** Compact period selector for charts. Sits in a single row above the chart. */
export function PeriodFilter({
  value,
  onChange,
  options = OPTIONS,
  className,
}: {
  value: Period;
  onChange: (p: Period) => void;
  options?: { value: Period; label: string }[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex gap-0.5 rounded-full border border-hairline p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
            value === o.value ? "bg-brand text-white keep-brand" : "text-muted hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Days-back for a period (ytd handled by the caller against Jan 1). */
export function periodDays(p: Period): number {
  return { "7d": 7, "30d": 30, "90d": 90, "12mo": 365, ytd: 365 }[p];
}
