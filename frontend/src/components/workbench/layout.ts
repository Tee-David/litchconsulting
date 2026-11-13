"use client";

import { useCallback, useEffect, useState } from "react";

/** How a person likes the workbench laid out. Kept per person, on this device. */
export type WorkbenchPrefs = {
  /** split: sheet and Sage side by side. focus: the sheet fills the editor, Sage opens inside it. */
  layout: "split" | "focus";
  /** Width of the Sage column in split layout, in px. */
  sageWidth: number;
  /** Grid zoom, one of ZOOM_STEPS. */
  zoom: number;
};

export const ZOOM_STEPS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2] as const;
export const SAGE_MIN = 320;
export const SAGE_MAX = 640;
const DEFAULTS: WorkbenchPrefs = { layout: "split", sageWidth: 410, zoom: 1 };
const KEY = "litch.workbench.prefs";

export function clampSage(w: number): number {
  return Math.round(Math.min(SAGE_MAX, Math.max(SAGE_MIN, w)));
}

/** One zoom step up (+1), down (-1), or back to 100 % (0). */
export function stepZoom(current: number, step: 1 | -1 | 0): number {
  if (step === 0) return 1;
  const i = ZOOM_STEPS.findIndex((z) => z >= current - 0.001);
  const at = i < 0 ? ZOOM_STEPS.length - 1 : i;
  const next = Math.min(ZOOM_STEPS.length - 1, Math.max(0, at + step));
  return ZOOM_STEPS[next];
}

function read(): WorkbenchPrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<WorkbenchPrefs>;
    return {
      layout: p.layout === "focus" ? "focus" : "split",
      sageWidth: clampSage(Number(p.sageWidth) || DEFAULTS.sageWidth),
      zoom: ZOOM_STEPS.includes(Number(p.zoom) as (typeof ZOOM_STEPS)[number]) ? Number(p.zoom) : 1,
    };
  } catch {
    return DEFAULTS;
  }
}

export function useWorkbenchPrefs(): [WorkbenchPrefs, (patch: Partial<WorkbenchPrefs>) => void] {
  const [prefs, setPrefs] = useState<WorkbenchPrefs>(DEFAULTS);
  // Read after mount: the server render cannot see localStorage.
  useEffect(() => setPrefs(read()), []);
  const update = useCallback((patch: Partial<WorkbenchPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* private mode: the choice lasts for this visit only */
      }
      return next;
    });
  }, []);
  return [prefs, update];
}
