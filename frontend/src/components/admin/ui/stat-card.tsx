import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** KPI tile for the dashboard / list headers. */
export function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string | number;
  delta?: { value: string; direction: "up" | "down" };
  icon?: LucideIcon;
  hint?: string;
}) {
  return (
    <div className="rounded-card border border-hairline bg-paper p-5 shadow-sm shadow-black/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-body">{label}</p>
        {Icon && (
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-tint text-brand">
            <Icon className="size-4.5" />
          </span>
        )}
      </div>
      <p className="mt-3 font-display text-2xl font-bold tracking-tight text-ink">{value}</p>
      {(delta || hint) && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          {delta && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-semibold",
                delta.direction === "up" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
              )}
            >
              {delta.direction === "up" ? (
                <ArrowUpRight className="size-3.5" />
              ) : (
                <ArrowDownRight className="size-3.5" />
              )}
              {delta.value}
            </span>
          )}
          {hint && <span className="text-muted">{hint}</span>}
        </div>
      )}
    </div>
  );
}
