"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AlertCircle, ArrowRightLeft, Check, ChevronRight, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Trace: one line of Sage's work (after shadcn.io/ai "Trace"). An icon, a title
 * that says the state in words ("Reading…", "Read", "Failed to read"), an
 * optional meta (a time, a count) and, when there is something to show, a
 * chevron that opens it. Running lines shimmer and are plain text (no tab stop).
 *
 * `open` follows `running` until the reader toggles it: a running group is open,
 * and it folds by itself when the work ends.
 */
export type TraceStatus = "running" | "done" | "error" | "waiting" | "switch" | "none";

export function TraceIcon({ status, icon }: { status: TraceStatus; icon?: ReactNode }) {
  const box = "grid size-4 shrink-0 place-items-center";
  if (status === "running") return <Loader2 className="size-3.5 shrink-0 animate-spin text-accent motion-reduce:animate-none dark:text-info" aria-hidden />;
  if (status === "error") return <AlertCircle className="size-3.5 shrink-0 text-bad" aria-hidden />;
  if (status === "switch") return <ArrowRightLeft className="size-3.5 shrink-0 text-warn" aria-hidden />;
  if (status === "waiting") return <Circle className="size-3 shrink-0 text-faint" aria-hidden />;
  if (icon) return <span className={cn(box, "text-muted [&_svg]:size-3.5")} aria-hidden>{icon}</span>;
  if (status === "done") return <Check className="size-3.5 shrink-0 text-good" aria-hidden />;
  return <span className={box} aria-hidden />;
}

export function Trace({
  status = "none",
  icon,
  title,
  meta,
  children,
  defaultOpen,
  className,
  size = "md",
}: {
  status?: TraceStatus;
  icon?: ReactNode;
  title: ReactNode;
  /** Right-hand detail that must stay readable (a time, a count). */
  meta?: ReactNode;
  /** What opens. No children: a plain line. */
  children?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  size?: "md" | "sm";
}) {
  const running = status === "running";
  const [touched, setTouched] = useState<boolean | null>(defaultOpen ?? null);
  const open = touched ?? running;
  const id = useId();
  const text = size === "sm" ? "text-[12.5px]" : "text-[13px]";
  const head = (
    <>
      <TraceIcon status={status} icon={icon} />
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          status === "waiting" ? "text-muted" : status === "error" ? "text-bad" : "text-body",
          running && "sage-shimmer",
        )}
      >
        {title}
      </span>
      {meta ? <span className="shrink-0 tabular-nums text-muted">{meta}</span> : null}
    </>
  );

  if (!children) {
    return <div className={cn("flex min-h-8 items-center gap-2", text, className)}>{head}</div>;
  }
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setTouched(!open)}
        className={cn(
          "group flex min-h-8 w-full items-center gap-2 rounded-lg text-left outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40",
          text,
        )}
      >
        {head}
        <ChevronRight className={cn("size-3.5 shrink-0 text-faint transition-transform duration-150 group-hover:text-ink motion-reduce:transition-none", open && "rotate-90")} aria-hidden />
      </button>
      {open ? (
        <div id={id} className="ml-[7px] border-l border-hairline pb-1 pl-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Seconds since a start, ticking while `running` (for "Working · 4 s"). */
export function useElapsed(running: boolean): number {
  const [s, setS] = useState(0);
  const start = useRef<number | null>(null);
  useEffect(() => {
    if (!running) return;
    start.current = Date.now();
    setS(0);
    const t = setInterval(() => setS(Math.round((Date.now() - (start.current ?? Date.now())) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running]);
  return s;
}

export const seconds = (ms: number | null | undefined) =>
  typeof ms === "number" && ms > 0 ? (ms < 1000 ? "under 1 s" : `${Math.round(ms / 1000)} s`) : null;

/** A small output box inside a step: wraps, scrolls past 16rem, mono when asked. */
export function TraceOutput({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return (
    <div
      tabIndex={0}
      className={cn(
        "mt-1 max-h-64 overflow-auto rounded-lg bg-surface px-2.5 py-2 text-[12px] leading-relaxed text-body outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        mono ? "whitespace-pre-wrap break-words font-mono text-[11.5px]" : "break-words",
      )}
    >
      {children}
    </div>
  );
}
