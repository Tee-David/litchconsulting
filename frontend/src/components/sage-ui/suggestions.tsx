"use client";

import { CornerDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Suggested questions above the message bar. On a phone they scroll sideways with
 * faded edges; from tablet up they wrap onto at most two lines.
 */
export function Suggestions({
  items,
  onPick,
  disabled,
  label = "Suggested questions",
  className,
}: {
  items: string[];
  onPick: (text: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  if (!items.length) return null;
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [mask-image:linear-gradient(to_right,transparent,#000_12px,#000_calc(100%-24px),transparent)] [scrollbar-width:none] sm:mx-0 sm:max-h-[84px] sm:flex-wrap sm:overflow-hidden sm:px-0 sm:[mask-image:none]",
        className,
      )}
    >
      {items.map((c) => (
        <button
          key={c}
          type="button"
          disabled={disabled}
          onClick={() => onPick(c)}
          className="group inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-paper px-3.5 text-[13px] text-body transition-colors hover:border-transparent hover:bg-brand-tint hover:text-ink disabled:opacity-50 dark:bg-surface"
        >
          <CornerDownRight className="size-3.5 text-faint transition-colors group-hover:text-accent dark:group-hover:text-info" aria-hidden />
          <span className="whitespace-nowrap">{c}</span>
        </button>
      ))}
    </div>
  );
}
