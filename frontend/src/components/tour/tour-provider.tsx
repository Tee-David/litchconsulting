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
import { Joyride, EVENTS, STATUS, type EventData, type Controls } from "react-joyride";
import { TOURS, type TourAudience, type TourStep } from "./registry";
import { pageTourIdFor } from "./route-match";
import { BRAND_OPTIONS, BRAND_STYLES, LOCALE } from "./joyride-theme";
import { isDesktop, waitForTarget } from "./wait-for-target";
import { fireConfetti } from "./confetti";

type TourContextValue = {
  /** Which side of the app this provider serves. */
  audience: TourAudience;
  /** Start any registered tour by id. */
  startTour: (id: string) => void;
  /** Start the page tour for the current route (no-op if none). */
  startPageTour: () => void;
  /** Start the audience's cross-page walkthrough. */
  startWalkthrough: () => void;
  /** Start (replay) the audience's welcome tour. */
  startWelcome: () => void;
  /** Stop any running tour. */
  stopTour: () => void;
  /** Whether a runnable page tour exists for the current route. */
  hasPageTour: () => boolean;
  /** Whether a tour is currently running. */
  isRunning: boolean;
};

const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) {
    throw new Error("useTour must be used within a <TourProvider>");
  }
  return ctx;
}

const LEGACY_CLIENT_KEY = "litch:portal-tour-done";

/** Is a step's target present (and, for desktopOnly steps, are we on desktop)? */
function isStepPresent(step: TourStep): boolean {
  if (step.desktopOnly && !isDesktop()) return false;
  const target = step.target;
  if (typeof target !== "string") return true;
  if (target === "body") return true;
  return typeof document !== "undefined" && document.querySelector(target) !== null;
}

export function TourProvider({
  audience,
  children,
}: {
  audience: TourAudience;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // Live refs so before-hooks / callbacks always see the current values.
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const [activeTourId, setActiveTourId] = useState<string | null>(null);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [run, setRun] = useState(false);
  const activeTourIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeTourIdRef.current = activeTourId;
  }, [activeTourId]);
  // Guards the terminal handler — a finished tour can emit more than one event
  // carrying the terminal status before the teardown re-render lands.
  const terminalHandledRef = useRef(false);

  const welcomeKey = useMemo(() => `litch:tour:${audience}:welcome`, [audience]);

  const stopTour = useCallback(() => {
    setRun(false);
    setActiveTourId(null);
    setSteps([]);
  }, []);

  /** Poll until the router has actually landed on `route` (or we time out). */
  const waitForRoute = useCallback(async (route: string, timeout = 8000) => {
    const start = Date.now();
    while (pathnameRef.current !== route && Date.now() - start < timeout) {
      await new Promise((r) => setTimeout(r, 60));
    }
  }, []);

  const startTour = useCallback(
    (id: string) => {
      const def = TOURS[id];
      if (!def) return;

      let built: TourStep[];
      if (def.kind === "walkthrough") {
        // Cross-page steps: decorate each with a before-hook that navigates to
        // the step's route and waits for its target to render.
        built = def.steps.map((step) => {
          const route = step.route;
          if (!route) return step;
          return {
            ...step,
            before: async () => {
              if (pathnameRef.current !== route) {
                router.push(route);
                await waitForRoute(route);
              }
              const target = typeof step.target === "string" ? step.target : null;
              if (target && target !== "body") {
                await waitForTarget(target, 8000);
              }
            },
          };
        });
      } else {
        // Page / welcome tours run on the current page — drop any step whose
        // target isn't in the DOM so we never spotlight nothing.
        built = def.steps.filter(isStepPresent);
      }

      if (built.length === 0) return;

      terminalHandledRef.current = false;
      setSteps(built);
      setActiveTourId(id);
      setRun(true);
    },
    [router, waitForRoute],
  );

  const startWelcome = useCallback(() => {
    startTour(audience === "client" ? "client-welcome" : "admin-welcome");
  }, [audience, startTour]);

  const startWalkthrough = useCallback(() => {
    startTour(audience === "client" ? "client-walkthrough" : "admin-walkthrough");
  }, [audience, startTour]);

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

  const onEvent = useCallback(
    (data: EventData, controls: Controls) => {
      // A missing target (e.g. an optional anchor) just advances the tour.
      if (data.type === EVENTS.TARGET_NOT_FOUND) {
        controls.next();
        return;
      }
      // Terminal states: persist the welcome flag and tear the tour down.
      const finished = data.status === STATUS.FINISHED;
      const skipped = data.status === STATUS.SKIPPED;
      if (!finished && !skipped) return;
      if (terminalHandledRef.current) return;
      terminalHandledRef.current = true;

      const id = activeTourIdRef.current;
      const def = id ? TOURS[id] : null;
      if (def?.kind === "welcome") {
        try {
          localStorage.setItem(welcomeKey, "1");
        } catch {}
      }
      // Celebrate only when they made it to the end — never on a skip.
      if (finished) fireConfetti();
      stopTour();
    },
    [stopTour, welcomeKey],
  );

  // Auto-run the welcome tour once per audience.
  useEffect(() => {
    let seen = false;
    try {
      if (localStorage.getItem(welcomeKey)) {
        seen = true;
      } else if (audience === "client" && localStorage.getItem(LEGACY_CLIENT_KEY)) {
        // Existing portal users already saw the old tour — don't re-nag them.
        localStorage.setItem(welcomeKey, "1");
        seen = true;
      }
    } catch {
      seen = true; // storage blocked — err on the side of not auto-running.
    }
    if (seen) return;

    const timer = setTimeout(() => {
      startWelcome();
    }, 900);
    return () => clearTimeout(timer);
    // Run once on mount for this audience.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<TourContextValue>(
    () => ({
      audience,
      startTour,
      startPageTour,
      startWalkthrough,
      startWelcome,
      stopTour,
      hasPageTour,
      isRunning: run,
    }),
    [audience, startTour, startPageTour, startWalkthrough, startWelcome, stopTour, hasPageTour, run],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      <Joyride
        key={activeTourId ?? "idle"}
        steps={steps}
        run={run}
        continuous
        scrollToFirstStep
        locale={LOCALE}
        options={{ ...BRAND_OPTIONS, beforeTimeout: 15000, targetWaitTimeout: 8000 }}
        styles={BRAND_STYLES}
        onEvent={onEvent}
      />
    </TourContext.Provider>
  );
}
