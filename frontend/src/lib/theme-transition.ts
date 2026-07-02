import { flushSync } from "react-dom";

type VTDocument = Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };

/**
 * Theme change with an "expand from" view transition: a circle clip-path grows
 * from the click origin to cover the screen. The new theme is applied
 * synchronously inside the transition (flushSync + a direct class toggle) so the
 * snapshot actually differs. Falls back to an instant change when View
 * Transitions are unavailable or the user prefers reduced motion.
 */
export function animateThemeChange(
  theme: "light" | "dark",
  setTheme: (t: string) => void,
  origin?: { x: number; y: number },
  duration = 550,
) {
  const doc = document as VTDocument;
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const apply = () => {
    flushSync(() => setTheme(theme));
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  };

  if (typeof doc.startViewTransition !== "function" || reduced) {
    apply();
    return;
  }

  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 2;
  const end = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

  doc
    .startViewTransition(apply)
    .ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
        { duration, easing: "ease-in-out", pseudoElement: "::view-transition-new(root)" },
      );
    })
    .catch(() => {});
}
