"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Compass, X } from "lucide-react";
import type { TourAudience } from "./registry";

const LINES: Record<TourAudience, string> = {
  admin: "See where the work, the money and Sage live, and what to do first each day.",
  staff: "See your assigned work, the workbench and Sage, and how to hand work back.",
  client: "See how to request a service, send files, pay and follow your work.",
};

/**
 * First sign-in: a small card that offers the walkthrough once per role and
 * walkthrough version. It never starts a tour by itself. "Later" keeps the
 * tours in the "?" menu.
 */
export function TourOffer({
  audience,
  minutes,
  onStart,
  onLater,
}: {
  audience: TourAudience;
  minutes: number;
  onStart: () => void;
  onLater: () => void;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.aside
      role="dialog"
      aria-label="Take the tour"
      data-tour-card
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[60] rounded-2xl border border-hairline bg-paper p-4 text-ink shadow-[0_12px_40px_rgb(10_14_26/0.2)] sm:inset-x-auto sm:right-6 sm:w-[22rem] lg:bottom-6 dark:shadow-[0_12px_40px_rgb(0_0_0/0.5)]"
    >
      <div className="flex items-start gap-3">
        <span className="keep-brand grid size-9 shrink-0 place-items-center rounded-xl bg-brand text-white dark:bg-info dark:text-paper">
          <Compass className="size-[18px]" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-semibold leading-snug">New here? Take the tour</p>
          <p className="mt-1 text-[13px] leading-relaxed text-body">{LINES[audience]}</p>
        </div>
        <button
          type="button"
          onClick={onLater}
          aria-label="Close"
          className="-mr-2 -mt-2 grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="mt-4 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onLater}
          className="min-h-10 rounded-full px-3 text-[12.5px] font-semibold text-body hover:bg-surface hover:text-ink"
        >
          Later
        </button>
        <button
          type="button"
          onClick={onStart}
          className="min-h-10 rounded-full bg-act px-4 text-[12.5px] font-semibold text-act-ink hover:bg-act-hover"
        >
          Show me around ({minutes} min)
        </button>
      </div>
      <p className="mt-2 text-right text-[11.5px] text-muted">The tours stay in the ? menu at the top.</p>
    </motion.aside>
  );
}
