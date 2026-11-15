import type { Step } from "react-joyride";
import type { TourIconName } from "./tour-icon";

/**
 * Tour registry — the single source of truth for every guided tour in the app.
 *
 * A `TourStep` is a react-joyride `Step` plus a few Litch-specific fields:
 *  - `key`          stable id for the step (debugging / React keys)
 *  - `route`        walkthrough steps that live on another page set this; the
 *                   provider decorates them with a `before` hook that navigates
 *                   there and waits for the target to mount.
 *  - `page`         friendly page name, shown in the tooltip and used to count
 *                   "N pages to go" in the walkthroughs.
 *  - `optional`     the step is dropped silently if its target isn't in the DOM
 *                   (empty tables, unconfigured cards, …).
 *  - `desktopOnly`  dropped below the `lg` breakpoint — the sidebar rail is
 *                   `hidden lg:block`, so its anchors exist but are invisible.
 *  - `mobileOnly`   dropped at `lg` and up (e.g. the drawer's hamburger).
 *  - `icon`         animated tooltip icon (see `tour-icon.tsx`).
 *  - `interact`     interactive stop: the user clicks the target and the tour
 *                   advances itself. The Next button still works as a fallback.
 *  - `showEstimate` render the "~3 min · 12 stops" chip (intro steps only).
 *
 * Copy rule: say what is *actually* on the page and what the operator can do
 * with it. No filler, no "this is the dashboard".
 */
export type TourAudience = "client" | "admin" | "staff";
/** A lesson is a short, cross-page Learn Sage tour; it runs like a walkthrough. */
export type TourKind = "page" | "welcome" | "walkthrough" | "lesson";

/**
 * What a stop asks the person to do, beyond Next.
 *  - `ask`:   a button in the card sends `text` to Sage for the person, then the
 *             tour waits for the answer and moves on.
 *  - `click`: a button in the card clicks `selector` for the person (for example
 *             Dismiss on a plan), then waits for `wait` to appear (if given).
 *  - `turn`:  the person asks their own question; `examples` fill the box. The
 *             tour moves on when an answer arrives. Next always works.
 */
export type TourAction =
  | { kind: "ask"; label: string; text: string; surface?: "sage" | "workbench"; waiting?: string }
  | { kind: "click"; label: string; selector: string; wait?: string; waiting?: string }
  | { kind: "select"; label: string; range: string }
  | { kind: "turn"; examples: string[]; surface?: "sage" | "workbench"; waiting?: string };

export type TourStep = Step & {
  key: string;
  route?: string;
  page?: string;
  optional?: boolean;
  desktopOnly?: boolean;
  mobileOnly?: boolean;
  icon?: TourIconName;
  interact?: { hint: string; clickTarget?: string };
  showEstimate?: boolean;
  action?: TourAction;
  /** The part sits in a sheet or dialog: the focus is left free for it. */
  inDialog?: boolean;
};

export type TourDef = {
  id: string;
  audience: TourAudience;
  kind: TourKind;
  /** Home route for a page tour (informational; page tours are matched by route-match). */
  route?: string;
  /**
   * Bump when the copy or stops change enough to show again. Completion is
   * stored per user and version on the server (user_onboarding.tours), so a
   * finished tour stays finished on every device until its version moves.
   */
  version?: number;
  /** Lessons: the name and one line for the Learn Sage list. */
  title?: string;
  summary?: string;
  steps: TourStep[];
};

/** Convenience for a full-screen, centered "intro / outro" step. */
export function centerStep(
  key: string,
  title: string,
  content: string,
  extra: Partial<TourStep> = {},
): TourStep {
  return {
    key,
    target: "body",
    placement: "center",
    // Centered steps have nothing to scroll to — joyride skips scrolling for
    // `placement: center` anyway, but being explicit keeps intent obvious.
    skipScroll: true,
    title,
    content,
    ...extra,
  };
}

/** A sidebar nav anchor. Desktop-only: the rail is `hidden` below `lg`. */
export function navStep(
  tourKey: string,
  title: string,
  content: string,
  extra: Partial<TourStep> = {},
): TourStep {
  return {
    key: `nav-${tourKey}`,
    target: `[data-tour="nav-${tourKey}"]`,
    placement: "right",
    desktopOnly: true,
    title,
    content,
    ...extra,
  };
}

