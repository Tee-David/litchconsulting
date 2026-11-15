"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { recordTourAction, tourStateAction } from "@/app/account/actions";
import { Joyride, EVENTS, STATUS, type EventData, type Controls, type FloatingOptions } from "react-joyride";
import { TOURS, type TourAudience, type TourDef, type TourStep } from "./registry";
import { pageTourIdFor } from "./route-match";
import { BRAND_OPTIONS, LOCALE } from "./joyride-theme";
import { withStepMeta, type TourStepMeta } from "./tour-meta";
import { TourTooltip } from "./tour-tooltip";
import { isDesktop, prefersReducedMotion, waitForTarget } from "./wait-for-target";
import { blockedByDialog, openDialog } from "./tour-actions";
import { fireConfetti } from "./confetti";
import { LearnSage } from "./learn-sage";
import { TourOffer } from "./tour-offer";

type TourState = Record<string, { version: number; status: string }>;

type TourContextValue = {
  /** Which side of the app this provider serves. */
  audience: TourAudience;
  /** Start any registered tour by id. `resume` continues where the person stopped. */
  startTour: (id: string, opts?: { resume?: boolean }) => void;
  /** Start the page tour for the current route (no-op if none). */
  startPageTour: () => void;
  /** Start (or resume) the audience's cross-page walkthrough. */
  startWalkthrough: (opts?: { resume?: boolean }) => void;
  /** Stop any running tour. */
  stopTour: () => void;
  /** Whether a runnable page tour exists for the current route. */
  hasPageTour: () => boolean;
  /** Where a stopped tour can continue: "step 7 of 40", or null. */
  resumePoint: (id: string) => { index: number; total: number } | null;
  /** Whether a tour is currently running. */
  isRunning: boolean;
  /** Whether this audience has a cross-page walkthrough. */
  hasWalkthrough: boolean;
  /** Admin and staff: open the Learn Sage lessons. */
  hasLessons: boolean;
  openLessons: () => void;
  /** Open the "?" menu (the account menu "Take a tour" item uses it). */
  openMenu: () => void;
  menuSignal: number;
};

const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within a <TourProvider>");
  return ctx;
}

/** The same, but null outside a provider (shared components such as the Sage page). */
export function useTourOptional(): TourContextValue | null {
  return useContext(TourContext);
}

const LEGACY_CLIENT_KEY = "litch:portal-tour-done";

/**
 * How long a `before` hook waits for a cross-page target to mount. Kept well
 * under `targetWaitTimeout + beforeTimeout` so a step whose anchor never
 * arrives fails fast into the skip path instead of stalling the tour.
 */
const TARGET_WAIT_MS = 5000;

/** `?tour=1` in the address bar. */
const wantsTour = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tour") === "1";

const OFFER_ON = true;

const resumeKey = (id: string) => `litch:tour:resume:${id}`;

/** Is a step's target present, and does it apply to this viewport? */
function isStepPresent(step: TourStep): boolean {
  // Sidebar anchors are `hidden lg:block`: present in the DOM but invisible.
  if (step.desktopOnly && !isDesktop()) return false;
  if (step.mobileOnly && isDesktop()) return false;
  const target = step.target;
  if (typeof target !== "string") return true;
  if (target === "body") return true;
  return typeof document !== "undefined" && document.querySelector(target) !== null;
}

const fitsViewport = (step: TourStep) => !(step.desktopOnly && !isDesktop()) && !(step.mobileOnly && isDesktop());

const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;

/**
 * Phones: the card is a full-width sheet at the bottom of the screen, or at the
 * top when the part it points at sits in the lower half (the tab bar).
 */
const SHEET: FloatingOptions = {
  strategy: "fixed",
  hideArrow: true,
  middleware: [
    {
      name: "litchSheet",
      fn: ({ rects }) => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const ref = rects.reference;
        const low = ref.height > 0 && ref.y + ref.height / 2 > vh * 0.5;
        const top = 72; // under the sticky top bar
        return {
          x: Math.max(8, (vw - rects.floating.width) / 2),
          y: low ? top : Math.max(top, vh - rects.floating.height - 8),
        };
      },
    },
  ],
};

/** Desktop: a card next to a tall part (a full table) shifts up into view instead of hanging below the screen. */
const DESKTOP: FloatingOptions = { shiftOptions: { crossAxis: true, padding: 12 } };

export function TourProvider({ audience, children }: { audience: TourAudience; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const welcomeId = `${audience}-welcome`;
  const walkthroughId = `${audience}-walkthrough`;
  // The first sign-in offer is shown once per role and walkthrough version.
  const offerVersion = TOURS[walkthroughId]?.version ?? TOURS[welcomeId]?.version ?? 1;
  const hasLessons = audience !== "client" && Object.values(TOURS).some((t) => t.kind === "lesson" && t.audience === audience);

  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const [activeTourId, setActiveTourId] = useState<string | null>(null);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [run, setRun] = useState(false);
  const [paused, setPaused] = useState(false);
  const [startIndex, setStartIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(96);
  const [reduced, setReduced] = useState(false);
  const [phone, setPhone] = useState(false);
  const [lessonsOpen, setLessonsOpen] = useState(false);
  const [offer, setOffer] = useState(false);
  const [menuSignal, setMenuSignal] = useState(0);
  const [tourState, setTourState] = useState<TourState>({});

  const activeTourIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeTourIdRef.current = activeTourId;
  }, [activeTourId]);
  const stepsRef = useRef<TourStep[]>([]);
  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);
  const indexRef = useRef(0);
  const controlsRef = useRef<Controls | null>(null);
  // A finished tour can emit more than one terminal event before teardown.
  const terminalHandledRef = useRef(false);

  const offerKey = useMemo(() => `litch:tour:${audience}:offer:v${offerVersion}`, [audience, offerVersion]);

  useEffect(() => {
    const sync = () => {
      setScrollOffset(isDesktop() ? 104 : 84);
      setReduced(prefersReducedMotion());
      setPhone(isPhone());
    };
    sync();
    window.addEventListener("resize", sync);
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    motion?.addEventListener?.("change", sync);
    return () => {
      window.removeEventListener("resize", sync);
      motion?.removeEventListener?.("change", sync);
    };
  }, []);

  const stopTour = useCallback(() => {
    setRun(false);
    setPaused(false);
    setActiveTourId(null);
    setSteps([]);
    setStepIndex(0);
    setStartIndex(0);
  }, []);

  /** Poll until the router has actually landed on `route` (or we time out). */
  const waitForRoute = useCallback(async (route: string, timeout = 8000) => {
    const start = Date.now();
    const matches = () => pathnameRef.current === route || (route.endsWith("/*") && pathnameRef.current.startsWith(route.slice(0, -1)));
    while (!matches() && Date.now() - start < timeout) {
      await new Promise((r) => setTimeout(r, 60));
    }
  }, []);

  /** A route can be a token: "@practice" opens (or makes) the practice workbook. */
  const goTo = useCallback(
    async (route: string) => {
      if (route === "@practice") {
        if (/\/analyses\/[^/]+$/.test(pathnameRef.current) && document.querySelector('[data-practice="1"]')) return;
        const { openPracticeAction } = await import("@/lib/workbench/practice-actions");
        const res = await openPracticeAction().catch(() => null);
        if (!res?.ok) return;
        router.push(res.href);
        await waitForRoute(res.href);
        // The sheet loads after the page: the next stops point into it.
        await waitForTarget('[data-tour="wb-grid"] [role="gridcell"]', 20000);
        return;
      }
      if (pathnameRef.current !== route) {
        router.push(route);
        await waitForRoute(route);
      }
    },
    [router, waitForRoute],
  );

  const resumePoint = useCallback((id: string) => {
    const def = TOURS[id];
    if (!def) return null;
    try {
      const key = localStorage.getItem(resumeKey(id));
      if (!key) return null;
      const list = def.steps.filter(fitsViewport);
      const index = list.findIndex((s) => s.key === key);
      return index > 0 ? { index, total: list.length } : null;
    } catch {
      return null;
    }
  }, []);

  const startTour = useCallback(
    (id: string, opts: { resume?: boolean } = {}) => {
      const def: TourDef | undefined = TOURS[id];
      if (!def) return;
      setOffer(false);

      let built: TourStep[];
      if (def.kind === "walkthrough" || def.kind === "lesson") {
        // Cross-page steps: a target can only be checked on its page, so only the
        // viewport filter runs now; a missing part is skipped when its turn comes.
        built = def.steps.filter(fitsViewport).map((step) => {
          const route = step.route;
          return {
            ...step,
            before: async () => {
              if (route) await goTo(route);
              const target = typeof step.target === "string" ? step.target : null;
              if (target && target !== "body") await waitForTarget(target, TARGET_WAIT_MS);
            },
          };
        });
      } else {
        // Page tours run on the current page: drop any stop whose part is absent.
        built = def.steps.filter(isStepPresent);
      }
      if (built.length === 0) return;

      // Typing in the message box and clicking real parts need the focus free.
      built = built.map((s) => (s.action || s.interact || s.inDialog ? { ...s, disableFocusTrap: true } : s));
      // The workbench fills the screen and scrolls inside: scrolling the page for its
      // parts only pushes the layout up and leaves a blank band.
      built = built.map((s) => (typeof s.target === "string" && s.target.includes('data-tour="wb-') ? { ...s, skipScroll: true } : s));

      let from = 0;
      if (opts.resume) {
        const point = resumePoint(id);
        if (point) from = point.index;
      }

      terminalHandledRef.current = false;
      setSteps(withStepMeta(built, def.kind));
      setActiveTourId(id);
      setStartIndex(from);
      setStepIndex(from);
      indexRef.current = from;
      setPaused(false);
      setRun(true);
    },
    [goTo, resumePoint],
  );

  const startWalkthrough = useCallback((opts?: { resume?: boolean }) => startTour(walkthroughId, opts), [walkthroughId, startTour]);

  const startPageTour = useCallback(() => {
    const id = pageTourIdFor(pathnameRef.current);
    if (id) startTour(id);
  }, [startTour]);

  const hasPageTour = useCallback(() => {
    const id = pageTourIdFor(pathnameRef.current);
    if (!id) return false;
    const def = TOURS[id];
    return !!def && def.steps.some(isStepPresent);
  }, []);

  const loadState = useCallback(async () => {
    const s = await tourStateAction().catch(() => ({}) as TourState);
    setTourState(s);
    return s;
  }, []);

  const openLessons = useCallback(() => {
    setLessonsOpen(true);
    void loadState();
  }, [loadState]);

  const onEvent = useCallback(
    (data: EventData, controls: Controls) => {
      controlsRef.current = controls;

      if (data.type === EVENTS.STEP_BEFORE || data.type === EVENTS.TOOLTIP) {
        setStepIndex(data.index);
        indexRef.current = data.index;
        // Walkthroughs and lessons remember the stop, for "Resume".
        const id = activeTourIdRef.current;
        const def = id ? TOURS[id] : null;
        const key = stepsRef.current[data.index]?.key;
        if (id && key && (def?.kind === "walkthrough" || def?.kind === "lesson")) {
          try {
            localStorage.setItem(resumeKey(id), key);
          } catch {}
        }
      }
      // A missing part (an empty table, a page that did not load) is skipped.
      if (data.type === EVENTS.TARGET_NOT_FOUND) {
        controls.next();
        return;
      }
      const finished = data.status === STATUS.FINISHED;
      const skipped = data.status === STATUS.SKIPPED;
      if (!finished && !skipped) return;
      if (terminalHandledRef.current) return;
      terminalHandledRef.current = true;

      const id = activeTourIdRef.current;
      const def = id ? TOURS[id] : null;
      if (id && def) {
        if (finished) {
          try {
            localStorage.removeItem(resumeKey(id));
          } catch {}
        }
        // Per user and version, on the server: follows the person to every device.
        void recordTourAction(id, def.version ?? 1, finished ? "finished" : "skipped").catch(() => {});
        setTourState((s) => ({ ...s, [id]: { version: def.version ?? 1, status: finished ? "finished" : "skipped" } }));
        // The walkthrough also answers the first sign-in offer.
        if (def.kind === "walkthrough") {
          try {
            localStorage.setItem(offerKey, "1");
          } catch {}
          void recordTourAction(welcomeId, offerVersion, "finished").catch(() => {});
        }
      }
      if (finished) fireConfetti();
      // A finished lesson brings the list back, with its tick.
      if (finished && def?.kind === "lesson") setTimeout(() => setLessonsOpen(true), 900);
      stopTour();
    },
    [stopTour, offerKey, welcomeId, offerVersion],
  );

  /**
   * Do stops: the person clicks the real part and the tour moves on. Capture
   * phase, so it still fires when the click navigates away.
   */
  useEffect(() => {
    if (!run || paused) return;
    const meta = steps[stepIndex]?.data as TourStepMeta | undefined;
    const selector = meta?.interactSelector;
    if (!selector) return;
    const onClick = (event: MouseEvent) => {
      const el = event.target as Element | null;
      if (el?.closest?.(selector)) setTimeout(() => controlsRef.current?.next(), 0);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [run, paused, stepIndex, steps]);

  /** Keys: arrows move, Esc stops (the place is kept for Resume). */
  useEffect(() => {
    if (!run || paused) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === "Escape") controlsRef.current?.skip("button_close");
      else if (e.key === "ArrowRight") controlsRef.current?.next();
      else if (e.key === "ArrowLeft" && indexRef.current > 0) controlsRef.current?.prev();
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [run, paused]);

  /**
   * A dialog that the stop does not point into pauses the tour; it comes back
   * on the same stop when the dialog closes.
   */
  useEffect(() => {
    if (!run) return;
    // Two ticks in a row, so a stop that opens a sheet on purpose (the next stop
    // points into it) does not flicker into a pause.
    let seen = 0;
    let pausedNow = false;
    const timer = setInterval(() => {
      const step = stepsRef.current[indexRef.current];
      const sel = typeof step?.target === "string" && step.target !== "body" ? step.target : null;
      seen = blockedByDialog(sel) ? seen + 1 : 0;
      const next = seen >= 2;
      if (next === pausedNow) return;
      pausedNow = next;
      if (next) setStartIndex(indexRef.current);
      setPaused(next);
    }, 400);
    return () => clearInterval(timer);
  }, [run]);

  /** `html { scroll-behavior: smooth }` fights joyride's scroll; turn it off during a tour. */
  useEffect(() => {
    if (!run) return;
    const html = document.documentElement;
    const previous = html.style.scrollBehavior;
    html.style.scrollBehavior = "auto";
    return () => {
      html.style.scrollBehavior = previous;
    };
  }, [run]);

  // `?tour=1` (the welcome screens and the onboarding list link here) starts the walkthrough.
  useEffect(() => {
    if (!wantsTour()) return;
    const timer = setTimeout(() => startWalkthrough(), 700);
    return () => clearTimeout(timer);
  }, [pathname, startWalkthrough]);

  // First sign-in: offer the walkthrough once per role and version. Never forced.
  useEffect(() => {
    if (!OFFER_ON || wantsTour()) return;
    let seen = false;
    try {
      if (localStorage.getItem(offerKey)) seen = true;
      else if (audience === "client" && localStorage.getItem(LEGACY_CLIENT_KEY)) {
        localStorage.setItem(offerKey, "1");
        seen = true;
      }
    } catch {
      seen = true;
    }
    if (seen || !TOURS[walkthroughId]) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const state = await loadState();
      if (cancelled) return;
      const rec = state[welcomeId];
      if (rec && rec.version >= offerVersion) {
        try {
          localStorage.setItem(offerKey, "1");
        } catch {}
        return;
      }
      if (!openDialog()) setOffer(true);
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Once on mount for this audience.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const declineOffer = useCallback(() => {
    setOffer(false);
    try {
      localStorage.setItem(offerKey, "1");
    } catch {}
    void recordTourAction(welcomeId, offerVersion, "skipped").catch(() => {});
  }, [offerKey, welcomeId, offerVersion]);

  const openMenu = useCallback(() => setMenuSignal((n) => n + 1), []);

  const value = useMemo<TourContextValue>(
    () => ({
      audience,
      startTour,
      startPageTour,
      startWalkthrough,
      stopTour,
      hasPageTour,
      resumePoint,
      isRunning: run,
      hasWalkthrough: Boolean(TOURS[walkthroughId]),
      hasLessons,
      openLessons,
      openMenu,
      menuSignal,
    }),
    [audience, startTour, startPageTour, startWalkthrough, stopTour, hasPageTour, resumePoint, run, walkthroughId, hasLessons, openLessons, openMenu, menuSignal],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {offer && !run ? (
        <TourOffer
          audience={audience}
          minutes={TOURS[walkthroughId] ? Math.max(1, Math.round((TOURS[walkthroughId].steps.length * 9) / 60)) : 3}
          onStart={() => startWalkthrough()}
          onLater={declineOffer}
        />
      ) : null}
      {hasLessons ? (
        <LearnSage
          open={lessonsOpen}
          onClose={() => setLessonsOpen(false)}
          audience={audience}
          state={tourState}
          onStart={(id) => {
            setLessonsOpen(false);
            setTimeout(() => startTour(id, { resume: Boolean(resumePoint(id)) }), 250);
          }}
        />
      ) : null}
      <Joyride
        key={activeTourId ?? "idle"}
        steps={steps}
        run={run && !paused}
        initialStepIndex={startIndex}
        continuous
        scrollToFirstStep
        locale={LOCALE}
        floatingOptions={phone ? SHEET : DESKTOP}
        options={{
          ...BRAND_OPTIONS,
          // The practice workbook can take a while to open (it is made on first use).
          beforeTimeout: 30000,
          targetWaitTimeout: 3000,
          scrollOffset,
          scrollDuration: reduced ? 0 : 420,
        }}
        tooltipComponent={TourTooltip}
        onEvent={onEvent}
      />
    </TourContext.Provider>
  );
}
