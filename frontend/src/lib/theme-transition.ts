type VTDocument = Document & {
  startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> };
};

/**
 * Theme change with a circle-wipe view transition from the click origin.
 *
 * The key insight: View Transitions take a full-page bitmap snapshot.
 * Running CSS animations (Ken Burns, orbits, Framer springs) during that
 * snapshot forces the browser to composite every animated layer before it can
 * rasterize — this is what causes the "hang".
 *
 * Fix: pause ALL CSS animations for the duration of the transition so the
 * browser snaps clean, static frames. We also avoid flushSync (which can
 * force a synchronous layout mid-transition) and instead rely on
 * next-themes' own synchronous class-toggle that happens inside the
 * startViewTransition callback naturally.
 */
export function animateThemeChange(
  theme: "light" | "dark",
  setTheme: (t: string) => void,
  origin?: { x: number; y: number },
  duration = 500,
) {
  const doc = document as VTDocument;
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Fallback: instant switch
  if (typeof doc.startViewTransition !== "function" || reduced) {
    setTheme(theme);
    return;
  }

  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 2;
  const end = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const root = document.documentElement;

  // ── Pause all CSS animations so the VT snapshot is a clean static frame ──
  // This prevents the browser from having to composite animated layers before
  // it can rasterize the before/after bitmaps.
  root.style.setProperty("--vt-pause", "paused");

  const vt = doc.startViewTransition(() => {
    // Apply theme — next-themes toggles `.dark` synchronously here,
    // which is exactly what the snapshot needs. No flushSync required.
    setTheme(theme);
    // Ensure color-scheme is in sync immediately
    root.style.colorScheme = theme;
  });

  // Once both snapshots are taken and the wipe animation can start,
  // restore animation playback
  vt.ready
    .then(() => {
      root.style.removeProperty("--vt-pause");

      // Animate the circle wipe on the incoming frame
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
        { duration, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    })
    .catch(() => {
      root.style.removeProperty("--vt-pause");
    });
}
