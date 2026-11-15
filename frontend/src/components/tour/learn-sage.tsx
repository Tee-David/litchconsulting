"use client";

import { Check, ChevronRight } from "lucide-react";
import { Sheet } from "@/components/kit/sheet";
import { cn } from "@/lib/utils";
import { TOURS, type TourAudience } from "./registry";
import { estimateMinutes } from "./tour-meta";

/**
 * Learn Sage: short lessons that make the person use Sage with safe example
 * questions. A tick shows a finished lesson (per user and lesson version).
 */
export function LearnSage({
  open,
  onClose,
  audience,
  state,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  audience: TourAudience;
  state: Record<string, { version: number; status: string }>;
  onStart: (id: string) => void;
}) {
  const lessons = Object.values(TOURS).filter((t) => t.kind === "lesson" && t.audience === audience);
  const done = lessons.filter((l) => state[l.id]?.status === "finished" && state[l.id].version >= (l.version ?? 1)).length;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Learn Sage"
      description={`${lessons.length} short lessons. You ask Sage real questions with safe examples. Nothing in your books changes.`}
      size="sm"
    >
      <p className="mb-3 text-[12.5px] text-muted">
        {done} of {lessons.length} done
      </p>
      <ol className="flex flex-col gap-2">
        {lessons.map((l, i) => {
          const finished = state[l.id]?.status === "finished" && state[l.id].version >= (l.version ?? 1);
          return (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => onStart(l.id)}
                className="group flex min-h-16 w-full items-center gap-3 rounded-xl border border-hairline px-3 py-3 text-left transition-colors hover:border-transparent hover:bg-brand-tint"
              >
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold tabular-nums",
                    finished ? "bg-ok text-white" : "bg-surface text-ink",
                  )}
                  aria-hidden
                >
                  {finished ? <Check className="size-4" strokeWidth={2.5} /> : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{l.title}</span>
                  {l.summary ? <span className="mt-0.5 block text-[12.5px] leading-snug text-body">{l.summary}</span> : null}
                  <span className="mt-1 block text-[11.5px] text-muted">
                    About {estimateMinutes(l.steps.length)} min{finished ? " · Done" : ""}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-faint group-hover:text-ink" aria-hidden />
              </button>
            </li>
          );
        })}
      </ol>
    </Sheet>
  );
}
