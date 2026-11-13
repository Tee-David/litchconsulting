"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Designed checkbox (never the browser default): a real button with
 * role="checkbox", 44px tall hit area, visible focus, label beside it.
 */
export function PlanCheck({
  checked,
  onChange,
  disabled,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "group flex min-h-11 w-full items-start gap-2.5 rounded-ctl py-2 pr-2 text-left text-[13.5px] leading-snug outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed",
        checked ? "text-ink" : "text-body",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-px grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors",
          checked ? "border-act bg-act text-act-ink" : "border-line-strong bg-paper group-hover:border-muted",
          disabled && "opacity-50",
        )}
      >
        {checked ? <Check className="size-3" strokeWidth={2.5} /> : null}
      </span>
      <span className="min-w-0">{children}</span>
    </button>
  );
}
