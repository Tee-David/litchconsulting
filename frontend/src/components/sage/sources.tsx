"use client";

import Link from "next/link";
import type { SageSource } from "@/lib/sage/present";
import { cn } from "@/lib/utils";
import { TickMark, sourceId } from "./citation-tick";

/**
 * The sources behind an answer. `margin`: the right column of the working
 * paper (desktop). `inline`: the same list under the answer (phones, widget).
 */
export function SourcesList({
  sources,
  answerId,
  variant = "margin",
  className,
}: {
  sources: SageSource[];
  answerId: string;
  variant?: "margin" | "inline";
  className?: string;
}) {
  if (!sources.length) return null;
  return (
    <aside aria-label="Sources" className={cn("flex flex-col gap-3", className)}>
      <p className="text-[12.5px] text-muted">Sources</p>
      <ol className={cn("flex flex-col", variant === "margin" ? "gap-2" : "gap-1")}>
        {sources.map((s) => {
          const body = (
            <>
              <TickMark n={s.n} />
              <span className="min-w-0 text-[13px] leading-snug">
                <span className="block font-semibold text-ink">{s.title}</span>
                {s.detail ? <span className="block text-muted">{s.detail}</span> : null}
              </span>
            </>
          );
          const cls =
            "flex gap-2.5 rounded-ctl p-1.5 -m-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 data-[flash]:bg-info-soft";
          return (
            <li key={s.n} className={variant === "inline" ? "py-1.5" : undefined}>
              {s.href ? (
                <Link id={sourceId(answerId, s.n)} href={s.href} className={cn(cls, "hover:bg-surface")}>
                  {body}
                </Link>
              ) : (
                <span id={sourceId(answerId, s.n)} tabIndex={-1} className={cls}>
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {variant === "margin" ? (
        <p className="mt-auto text-[11.5px] leading-normal text-muted">
          Each tick marks the record behind the answer. Open a source to check it.
        </p>
      ) : null}
    </aside>
  );
}
