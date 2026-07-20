"use client";

import { Check, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BadgeTone } from "@/components/admin/ui/badge";

/**
 * Shared pipeline-status logic + visual, used by both the request's AI card
 * and the Analyses review page — one canonical place for "what does this
 * status mean" so the two surfaces can't drift out of sync (a prior version
 * duplicated this and had a step-ordering bug only one copy got fixed).
 */
export const TERMINAL = new Set([
  "categorized",
  "ready",
  "published",
  "failed",
  "rejected",
  "extraction_failed",
  "error",
]);
export const FAILED = new Set(["failed", "rejected", "extraction_failed", "error"]);
export const STEPS = ["Queued", "Scanning", "Extracting", "Categorizing", "Ready"] as const;

export function stepIndex(status: string | null | undefined): number {
  const s = (status || "").toLowerCase();
  // Exact-match failure states FIRST — "extraction_failed" contains "extract"
  // and would otherwise misread as still-in-progress via the substring checks.
  if (FAILED.has(s)) return -1;
  if (s === "published" || s === "categorized" || s === "ready" || s === "extracted") return 4;
  if (s.includes("categor")) return 3;
  if (s.includes("extract")) return 2;
  if (s.includes("scan")) return 1;
  return 0; // queued / received / processing
}

export function statusTone(status: string | null | undefined): BadgeTone {
  const s = (status || "").toLowerCase();
  if (FAILED.has(s)) return "danger";
  switch (s) {
    case "categorized":
    case "extracted":
    case "ready":
      return "success";
    case "published":
      return "brand";
    case "":
      return "neutral";
    default:
      return "info"; // received / scanning / extracting / queued …
  }
}

export function PipelineStepper({
  status,
  reason,
  onRetry,
  retrying,
}: {
  status: string | null | undefined;
  reason?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const active = stepIndex(status);
  if (active < 0) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium text-red-600 dark:text-red-400">
          {reason ? `Analysis couldn't complete: ${reason}` : "Analysis failed."}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="inline-flex items-center gap-1 rounded-full border border-red-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
          >
            {retrying ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
            Reanalyze
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {STEPS.map((label, i) => {
        const done = i < active;
        const current = i === active && active < 4;
        return (
          <div key={label} className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                done && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                i === active && active === 4 && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                current && "bg-brand-tint text-brand",
                i > active && "text-muted"
              )}
            >
              {done ? (
                <Check className="size-2.5" />
              ) : current ? (
                <Loader2 className="size-2.5 animate-spin" />
              ) : null}
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="text-[10px] text-hairline">·</span>}
          </div>
        );
      })}
    </div>
  );
}
