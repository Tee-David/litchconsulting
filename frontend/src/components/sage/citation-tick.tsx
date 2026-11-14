"use client";

import { cn } from "@/lib/utils";

/** DOM id of a source in the margin, per answer. */
export const sourceId = (answerId: string, n: number) => `sage-src-${answerId}-${n}`;
/** Asks the answer's sources sheet to open on one source: detail { answerId, n }. */
export const SOURCE_EVENT = "sage:source";

/**
 * Audit tick: a circled number next to a claim, linked to the record behind
 * it. Activating it opens the sources sheet on that source and flashes it.
 */
export function CitationTick({ n, answerId, title, className }: { n: number; answerId: string; title?: string; className?: string }) {
  return (
    <a
      href={`#${sourceId(answerId, n)}`}
      onClick={(e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(SOURCE_EVENT, { detail: { answerId, n } }));
      }}
      aria-label={`Source ${n}${title ? `: ${title}` : ""}`}
      title={title}
      className={cn(
        "mx-0.5 inline-grid size-[18px] translate-y-[-2px] place-items-center rounded-full border-[1.5px] border-info align-middle text-[10.5px] font-semibold tabular-nums leading-none text-info no-underline outline-none transition-colors hover:bg-info-soft focus-visible:ring-2 focus-visible:ring-accent/40",
        className,
      )}
    >
      {n}
    </a>
  );
}

/** The tick as a plain mark (in the margin list). */
export function TickMark({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] border-info text-[11px] font-semibold tabular-nums leading-none text-info"
    >
      {n}
    </span>
  );
}
