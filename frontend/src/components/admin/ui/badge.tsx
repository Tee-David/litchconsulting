import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface text-body",
  brand: "bg-brand-tint text-brand",
  success: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  danger: "bg-red-500/12 text-red-600 dark:text-red-400",
  info: "bg-highlight/15 text-highlight",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  dot,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Map an invoice status to a badge tone. */
export function invoiceStatusTone(status: string): BadgeTone {
  switch (status) {
    case "paid":
      return "success";
    case "sent":
      return "info";
    case "overdue":
    case "declined":
    case "refunded":
      return "danger";
    case "accepted":
      return "success";
    case "void":
      return "neutral";
    default:
      return "warning"; // draft
  }
}
