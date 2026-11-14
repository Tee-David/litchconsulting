"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Database } from "lucide-react";
import { Sheet } from "@/components/kit";
import type { SageSource } from "@/lib/sage/present";
import { cn } from "@/lib/utils";
import { SOURCE_EVENT, TickMark, sourceId } from "./citation-tick";

/** The list of sources behind an answer (shown in the sources sheet). */
export function SourcesList({ sources, answerId }: { sources: SageSource[]; answerId: string }) {
  if (!sources.length) return null;
  return (
    <ol aria-label="Sources" className="flex flex-col divide-y divide-hairline">
      {sources.map((s) => {
        const body = (
          <>
            <TickMark n={s.n} />
            <span className="min-w-0 text-[14px] leading-snug">
              <span className="block font-semibold text-ink">{s.title}</span>
              {s.detail ? <span className="mt-0.5 block text-[13px] text-muted">{s.detail}</span> : null}
            </span>
          </>
        );
        const cls =
          "flex gap-3 rounded-ctl px-2 py-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 data-[flash]:bg-info-soft";
        return (
          <li key={s.n}>
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
  );
}

/**
 * Sources as one item in the answer's action row: up to three stacked marks and
 * "N sources". A press opens the full list in a sheet (a bottom sheet on phones).
 * A citation tick in the answer opens the same sheet and flashes its source.
 */
export function SourcesChip({ sources, answerId }: { sources: SageSource[]; answerId: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onCite = (e: Event) => {
      const d = (e as CustomEvent<{ answerId: string; n: number }>).detail;
      if (d?.answerId !== answerId) return;
      setOpen(true);
      // Wait for the sheet to mount, then flash the source the tick points to.
      window.setTimeout(() => {
        const el = document.getElementById(sourceId(answerId, d.n));
        if (!el) return;
        el.scrollIntoView({ block: "nearest" });
        el.focus({ preventScroll: true });
        el.setAttribute("data-flash", "1");
        window.setTimeout(() => el.removeAttribute("data-flash"), 1200);
      }, 80);
    };
    window.addEventListener(SOURCE_EVENT, onCite);
    return () => window.removeEventListener(SOURCE_EVENT, onCite);
  }, [answerId]);

  if (!sources.length) return null;
  const n = sources.length;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${n} ${n === 1 ? "source" : "sources"}. Show the list.`}
        className="ml-1 inline-flex min-h-8 items-center gap-2 rounded-full py-1 pl-1 pr-2.5 text-[13px] text-muted hover:bg-paper hover:text-ink"
      >
        <span aria-hidden className="flex -space-x-1.5">
          {sources.slice(0, 3).map((s) => (
            <span
              key={s.n}
              className="grid size-6 place-items-center rounded-full bg-brand-tint text-accent ring-2 ring-paper dark:text-info [&_svg]:size-3.5"
            >
              {s.kind === "records" ? <Database /> : <BookOpen />}
            </span>
          ))}
        </span>
        <span className="tabular-nums">
          {n} {n === 1 ? "source" : "sources"}
        </span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Sources" description="The records behind this answer. Open one to check it." size="sm">
        <SourcesList sources={sources} answerId={answerId} />
      </Sheet>
    </>
  );
}
