type VTDocument = Document & {
  startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> };
};

/**
 * Theme change with a circle-wipe view transition from the click origin.
 *
 * Strategy:
 * 1. Inject a style that kills per-element CSS transitions (the circle-wipe
 *    IS the transition; we don't want individual elements fading underneath).
 * 2. Inside the VT callback, toggle `.dark` + `colorScheme` directly on the
 *    DOM — two microsecond operations, zero React overhead.
 * 3. Immediately after, call setTheme() so React re-renders while the wipe
 *    animation is playing on the compositor thread. The compositor-driven
 *    clip-path animation is NOT blocked by main-thread React work.
 * 4. Clean up the transition-suppression style after the wipe finishes.
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

  // Suppress per-element CSS transitions during the swap
  const suppress = document.createElement("style");
  suppress.textContent = "*, *::before, *::after { transition-duration: 0s !important; }";
  document.head.appendChild(suppress);

  const vt = doc.startViewTransition(() => {
    // DOM-only toggle — instant, no React
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  });

  // Sync React state NOW while the wipe animation plays.
  // The clip-path animation runs on the compositor thread, so main-thread
  // React work doesn't cause any visible jank during the wipe.
  setTheme(theme);

  vt.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
        { duration, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    })
    .catch(() => {});

  // Clean up once the transition completes
  vt.finished
    .then(() => suppress.remove())
    .catch(() => suppress.remove());
}
