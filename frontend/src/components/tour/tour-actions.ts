"use client";

import { useEffect, type RefObject } from "react";

/**
 * The tour action bus. A "Try it" stop sends a question to Sage for the person,
 * and a "Your turn" chip fills the message box. The Sage composers (the Sage page,
 * the floating Sage and the workbench panel) listen; only a visible one answers.
 */
export const TOUR_ASK_EVENT = "litch:tour-ask";
export type TourSurface = "sage" | "workbench";
/** `handled` is set by the composer that took it, so the card knows if one did. */
export type TourAskDetail = { text: string; send: boolean; surface: TourSurface; handled?: boolean };

/** An answer from Sage, on the Sage page, the floating Sage or the workbench. */
export const SAGE_ANSWER = `article[aria-label="Sage's answer"], [data-sage-answer]`;
/** A chat area that is still working on an answer. */
const BUSY = `[aria-live][aria-busy="true"], [data-sage-busy="true"]`;

export function tourAsk(detail: TourAskDetail) {
  window.dispatchEvent(new CustomEvent<TourAskDetail>(TOUR_ASK_EVENT, { detail }));
}

/** Composer side: fill (and maybe send) when a tour asks, if this box is on screen. */
export function useTourAsk(
  surface: TourSurface,
  box: RefObject<HTMLElement | null>,
  handler: (text: string, send: boolean) => void,
) {
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<TourAskDetail>).detail;
      const el = box.current;
      if (!d || d.surface !== surface || !el) return;
      // Skip hidden copies (the floating Sage is unmounted or hidden on the Sage page).
      if (el.getClientRects().length === 0) return;
      d.handled = true;
      handler(d.text, d.send);
    };
    window.addEventListener(TOUR_ASK_EVENT, on);
    return () => window.removeEventListener(TOUR_ASK_EVENT, on);
  }, [surface, box, handler]);
}

/** A lesson selects a range in the workbench for the person (for example C2:C20). */
export const TOUR_SELECT_EVENT = "litch:tour-select";
export function tourSelect(range: string): boolean {
  const detail = { range, handled: false };
  window.dispatchEvent(new CustomEvent(TOUR_SELECT_EVENT, { detail }));
  return detail.handled;
}

export const countOf = (sel: string) => (typeof document === "undefined" ? 0 : document.querySelectorAll(sel).length);

/**
 * Resolve true when more elements match `sel` than `before` and no chat area is
 * busy (the answer is complete). False on timeout or abort.
 */
export function waitForMore(sel: string, before: number, timeout: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (signal.aborted) return resolve(false);
      if (countOf(sel) > before && !document.querySelector(BUSY)) return resolve(true);
      if (Date.now() - start > timeout) return resolve(false);
      setTimeout(tick, 350);
    };
    tick();
  });
}

/** Open modals that are not the tour's own card. */
export function openDialogs(): Element[] {
  return Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]')).filter(
    (el) =>
      !el.closest("[data-tour-card]") &&
      !el.querySelector("[data-tour-card]") &&
      !el.closest("#react-joyride-portal, .react-joyride__floater") &&
      el.getClientRects().length > 0,
  );
}

export function openDialog(): Element | null {
  return openDialogs()[0] ?? null;
}

/** True when a modal is open and none of the open modals holds the stop's part. */
export function blockedByDialog(sel: string | null): boolean {
  const list = openDialogs();
  if (!list.length) return false;
  // A centred stop (no part) sits above any sheet, so it never waits.
  return Boolean(sel) && !list.some((d) => d.querySelector(sel!));
}
