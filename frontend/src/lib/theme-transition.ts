type VTDocument = Document & {
  startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> };
};

/**
 * Theme change with a circle-wipe view transition from the click origin.
 *
 * THE CORE TRICK: do NOT trigger a React re-render inside the
 * startViewTransition callback. Instead, toggle the `.dark` class and
 * `colorScheme` on the DOM directly — this is two microsecond operations that
 * instantly produce the "after" frame. The browser can snapshot it immediately
 * with zero lag. React is synced *after* via setTheme outside the callback.
 *
 * Additionally, we suppress per-element CSS transitions during the swap
 * (the circle-wipe IS the transition, we don't want individual elements
 * fading their backgrounds/colors independently underneath it).
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

  // ── Suppress per-element CSS transitions during the swap ──
  // Without this, every element with `transition-colors` etc. fires its own
  // color fade underneath the circle-wipe, causing hundreds of simultaneous
  // transitions and visible lag.
  const suppress = document.createElement("style");
  suppress.textContent = "*, *::before, *::after { transition-duration: 0s !important; }";
  document.head.appendChild(suppress);

  const vt = doc.startViewTransition(() => {
    // Toggle theme at the DOM level only — no React re-render.
    // This is instant: just a class toggle + a style attribute.
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  });

  vt.ready
    .then(() => {
      // Both snapshots are now taken. Animate the circle-wipe reveal.
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
        { duration, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    })
    .catch(() => {});

  // Once the transition finishes, sync React state and clean up.
  // setTheme is deferred so React's re-render happens in the background
  // AFTER the visual wipe is already playing — no jank.
  vt.finished
    .then(() => {
      suppress.remove();
      setTheme(theme);
    })
    .catch(() => {
      suppress.remove();
      setTheme(theme);
    });
}
