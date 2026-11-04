import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Empty state that says WHY it is empty and WHAT to do next — never just
 * "Nothing here". `action` is the one next step (a button or link).
 */
export function EmptyState({
  icon,
  title,
  why,
  action,
  className,
  compact,
}: {
  icon?: ReactNode;
  title: string;
  why: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("mx-auto flex max-w-md flex-col items-center text-center", compact ? "py-6" : "py-12", className)}>
      {icon ? (
        <div className="mb-3 grid size-11 place-items-center rounded-full bg-brand-tint text-brand [&_svg]:size-5">{icon}</div>
      ) : null}
      <p className="font-display text-base font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-body">{why}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Pill-shaped single choice (period filters, AI mode, notification mode). */
export function Segmented<V extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
}: {
  value: V;
  onChange: (v: V) => void;
  options: Array<{ value: V; label: string; count?: number }>;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-hairline bg-surface p-0.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full font-medium transition-colors",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
              on ? "bg-paper text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {o.label}
            {typeof o.count === "number" ? <span className="tabular-nums opacity-70">{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
