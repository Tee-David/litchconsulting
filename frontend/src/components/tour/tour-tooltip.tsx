"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Clock3, Loader2, MousePointerClick, X } from "lucide-react";
import type { TooltipRenderProps } from "react-joyride";
import { TourIcon } from "./tour-icon";
import type { TourStepMeta } from "./tour-meta";
import { SAGE_ANSWER, countOf, tourAsk, tourSelect, waitForMore } from "./tour-actions";
import { waitForTarget } from "./wait-for-target";

/** How long a Try it / Your turn stop waits for Sage before it offers Next. */
const ANSWER_WAIT_MS = 120_000;

type Phase = "idle" | "waiting" | "slow" | "missing";

/**
 * The tour card. Desktop: a 22rem card next to the target. Phones: the provider
 * pins it to the bottom (or the top when the target is low) as a full-width sheet.
 * A stop can be Look (Next), Do (click the real part), Try it (the card acts for
 * the person and waits for the result) or Your turn (example questions).
 */
export function TourTooltip({
  index,
  size,
  step,
  backProps,
  closeProps,
  primaryProps,
  skipProps,
  tooltipProps,
  isLastStep,
  controls,
}: TooltipRenderProps) {
  const reduced = useReducedMotion();
  const meta = (step.data ?? {}) as Partial<TourStepMeta>;
  const action = meta.action;
  const pct = size > 0 ? Math.round(((index + 1) / size) * 100) : 0;
  const [phase, setPhase] = useState<Phase>("idle");
  const abort = useRef<AbortController | null>(null);

  // Stop waiting when the stop changes or the card closes.
  useEffect(() => () => abort.current?.abort(), []);

  const waitForAnswer = async (before: number) => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setPhase("waiting");
    const ok = await waitForMore(SAGE_ANSWER, before, ANSWER_WAIT_MS, ctl.signal);
    if (ctl.signal.aborted) return;
    if (ok) controls.next();
    else setPhase("slow");
  };

  // Your turn: watch for any new answer (a chip or the person's own question).
  useEffect(() => {
    if (action?.kind !== "turn") return;
    const before = countOf(SAGE_ANSWER);
    const ctl = new AbortController();
    abort.current = ctl;
    void waitForMore(SAGE_ANSWER, before, 30 * 60_000, ctl.signal).then((ok) => {
      if (ok && !ctl.signal.aborted) controls.next();
    });
    return () => ctl.abort();
    // One watcher per stop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const ask = (text: string, surface: "sage" | "workbench" = "sage") => {
    const before = countOf(SAGE_ANSWER);
    const detail = { text, send: true, surface, handled: false };
    tourAsk(detail);
    if (!detail.handled) {
      setPhase("missing");
      return;
    }
    if (action?.kind === "ask") void waitForAnswer(before);
    else setPhase("waiting");
  };

  const click = async () => {
    if (action?.kind === "select") {
      if (tourSelect(action.range)) controls.next();
      else setPhase("missing");
      return;
    }
    if (action?.kind !== "click") return;
    // Already open (the list is unfolded, Sage is on screen): a click would close it.
    if (action.wait && document.querySelector(action.wait)?.getClientRects().length) {
      controls.next();
      return;
    }
    const el = document.querySelector<HTMLElement>(action.selector);
    if (!el) {
      setPhase("missing");
      return;
    }
    el.click();
    if (action.wait) {
      setPhase("waiting");
      await waitForTarget(action.wait, 8000);
    }
    controls.next();
  };

  const acting = action?.kind === "ask" || action?.kind === "click" || action?.kind === "select";
  const waitingText = (action && "waiting" in action ? action.waiting : undefined) ?? "Sage is answering. This can take a few seconds.";

  return (
    <div
      {...tooltipProps}
      data-tour-card
      className="w-[calc(100vw-16px)] max-w-[24rem] overflow-hidden rounded-2xl border border-hairline bg-paper text-left text-ink shadow-[0_12px_40px_rgb(10_14_26/0.22)] sm:w-[22rem] dark:shadow-[0_12px_40px_rgb(0_0_0/0.5)]"
    >
      <div className="h-[3px] w-full bg-surface" aria-hidden>
        <motion.div
          className="h-full bg-brand dark:bg-info"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={reduced ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      <div className="max-h-[min(60dvh,32rem)] overflow-y-auto p-4">
        <div className="flex items-start gap-3">
          <TourIcon name={meta.icon} />
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-[11.5px] tabular-nums text-muted">
              Step {index + 1} of {size}
              {meta.page ? ` · ${meta.page}` : ""}
            </p>
            {step.title ? <p className="mt-0.5 font-display text-[15px] font-semibold leading-snug text-ink">{step.title}</p> : null}
          </div>
          <button
            {...closeProps}
            type="button"
            className="-mr-2 -mt-2 grid size-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {meta.showEstimate && meta.estimateMinutes && meta.totalStops ? (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[11.5px] font-medium text-body">
            <Clock3 className="size-3" aria-hidden />
            About {meta.estimateMinutes} min · {meta.totalStops} stops
          </p>
        ) : null}

        <div className="mt-2.5 text-[13.5px] leading-relaxed text-body">{step.content}</div>

        {meta.interactHint ? (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-surface px-3 py-2.5 text-[12.5px] font-medium text-ink">
            <MousePointerClick className="size-4 shrink-0 text-accent dark:text-info" aria-hidden />
            {meta.interactHint}
          </p>
        ) : null}

        {action?.kind === "ask" ? (
          <p className="mt-3 rounded-xl border border-hairline px-3 py-2.5 text-[13px] text-ink">
            <span className="mb-0.5 block text-[11px] text-muted">The question</span>
            {action.text}
          </p>
        ) : null}

        {action?.kind === "turn" ? (
          <div className="mt-3">
            <p className="text-[12px] text-muted">Type in the box, or pick one:</p>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {action.examples.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={phase === "waiting"}
                  onClick={() => ask(q, action.surface)}
                  className="group flex min-h-10 items-center justify-between gap-2 rounded-xl border border-hairline px-3 py-2 text-left text-[13px] text-ink transition-colors hover:border-transparent hover:bg-brand-tint disabled:opacity-50"
                >
                  {q}
                  <ArrowUpRight className="size-3.5 shrink-0 text-faint group-hover:text-accent dark:group-hover:text-info" aria-hidden />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {phase === "waiting" ? (
          <p role="status" className="mt-3 flex items-center gap-2 text-[12.5px] text-body">
            <Loader2 className="size-4 shrink-0 animate-spin text-muted motion-reduce:animate-none" aria-hidden />
            {waitingText}
          </p>
        ) : phase === "slow" ? (
          <p role="status" className="mt-3 text-[12.5px] text-body">Sage did not answer in time. Press Next to go on, or wait a little and look again.</p>
        ) : phase === "missing" ? (
          <p role="status" className="mt-3 text-[12.5px] text-body">That part is not on the screen now. Press Next to go on.</p>
        ) : null}

        {meta.encouragement ? <p className="mt-3 text-[11.5px] text-muted">{meta.encouragement}</p> : null}

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            {...skipProps}
            type="button"
            className="min-h-10 rounded-full px-2 text-[12.5px] font-medium text-muted transition-colors hover:text-ink"
          >
            {isLastStep ? "Close" : "Skip tour"}
          </button>
          <div className="flex items-center gap-1.5">
            {index > 0 ? (
              <button
                {...backProps}
                type="button"
                className="min-h-10 rounded-full px-3 text-[12.5px] font-semibold text-body transition-colors hover:bg-surface hover:text-ink"
              >
                Back
              </button>
            ) : null}
            {acting && phase === "idle" ? (
              <>
                {/* A click stop (Open Sage) has no Next: the stops after it need what it opens. */}
                {action.kind !== "click" ? (
                  <button
                    {...primaryProps}
                    type="button"
                    className="min-h-10 rounded-full px-3 text-[12.5px] font-semibold text-body transition-colors hover:bg-surface hover:text-ink"
                  >
                    Next
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => (action.kind === "ask" ? ask(action.text, action.surface) : void click())}
                  className="min-h-10 rounded-full bg-act px-4 text-[12.5px] font-semibold text-act-ink transition-colors hover:bg-act-hover"
                >
                  {action.label}
                </button>
              </>
            ) : (
              <button
                {...primaryProps}
                type="button"
                className="min-h-10 rounded-full bg-act px-4 text-[12.5px] font-semibold text-act-ink transition-colors hover:bg-act-hover"
              >
                {isLastStep ? "Done" : "Next"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
