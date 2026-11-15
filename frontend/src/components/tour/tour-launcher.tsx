"use client";

import { useEffect, useRef, useState } from "react";
import { CircleHelp, Compass, GraduationCap, MousePointerClick, RotateCcw } from "lucide-react";
import { useTour } from "./tour-provider";
import { cn } from "@/lib/utils";

/**
 * The "?" button in the top bar and its menu: Tour this page, the full
 * walkthrough (or Resume), and Learn Sage for the firm's team. The account
 * menu's "Take a tour" opens the same menu.
 */
export function TourLauncher() {
  const { startPageTour, startWalkthrough, hasPageTour, audience, hasWalkthrough, resumePoint, hasLessons, openLessons, menuSignal } = useTour();
  const [open, setOpen] = useState(false);
  const [canPage, setCanPage] = useState(false);
  const [resume, setResume] = useState<{ index: number; total: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const walkthroughId = `${audience}-walkthrough`;

  const show = () => {
    setCanPage(hasPageTour());
    setResume(resumePoint(walkthroughId));
    setOpen(true);
  };

  // "Take a tour" in the account menu.
  useEffect(() => {
    if (menuSignal === 0) return;
    show();
    button.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuSignal]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const item = "flex min-h-11 w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors";

  return (
    <div className="relative" ref={ref}>
      <button
        ref={button}
        type="button"
        aria-label="Guided tours"
        aria-haspopup="menu"
        aria-expanded={open}
        data-tour="tour-launcher"
        onClick={() => (open ? setOpen(false) : show())}
        className="grid size-10 place-items-center rounded-ctl border border-hairline bg-paper text-ink transition-colors hover:bg-surface"
      >
        <CircleHelp className="size-[18px]" strokeWidth={1.75} />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Guided tours"
          // Phones: pinned under the top bar, full width. Wider screens: under the button.
          className="fixed inset-x-3 top-[4.25rem] z-50 rounded-2xl border border-hairline bg-paper p-1.5 shadow-[0_12px_40px_rgb(10_14_26/0.16)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[19rem] dark:shadow-[0_12px_40px_rgb(0_0_0/0.5)]"
        >
          <button
            type="button"
            role="menuitem"
            disabled={!canPage}
            onClick={() => run(startPageTour)}
            className={cn(item, canPage ? "hover:bg-surface" : "cursor-not-allowed opacity-55")}
          >
            <MousePointerClick className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <span>
              <span className="block text-sm font-medium text-ink">Tour this page</span>
              <span className="block text-[12px] text-muted">{canPage ? "The parts of this page, in under a minute" : "No tour for this page yet"}</span>
            </span>
          </button>

          {hasWalkthrough ? (
            resume ? (
              <>
                <button type="button" role="menuitem" onClick={() => run(() => startWalkthrough({ resume: true }))} className={cn(item, "hover:bg-surface")}>
                  <Compass className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                  <span>
                    <span className="block text-sm font-medium text-ink">Resume the walkthrough</span>
                    <span className="block text-[12px] tabular-nums text-muted">
                      From step {resume.index + 1} of {resume.total}
                    </span>
                  </span>
                </button>
                <button type="button" role="menuitem" onClick={() => run(() => startWalkthrough())} className={cn(item, "hover:bg-surface")}>
                  <RotateCcw className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                  <span className="block text-sm font-medium text-ink">Start the walkthrough again</span>
                </button>
              </>
            ) : (
              <button type="button" role="menuitem" onClick={() => run(() => startWalkthrough())} className={cn(item, "hover:bg-surface")}>
                <Compass className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                <span>
                  <span className="block text-sm font-medium text-ink">Full walkthrough</span>
                  <span className="block text-[12px] text-muted">Every page, in order. Stop and resume at any time.</span>
                </span>
              </button>
            )
          ) : null}

          {hasLessons ? (
            <button type="button" role="menuitem" onClick={() => run(openLessons)} className={cn(item, "hover:bg-surface")}>
              <GraduationCap className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <span>
                <span className="block text-sm font-medium text-ink">Learn Sage</span>
                <span className="block text-[12px] text-muted">Short lessons. You ask, Sage answers, you see how.</span>
              </span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
