import type { Locale, Options } from "react-joyride";

/**
 * Brand theme for react-joyride.
 *
 * The tooltip itself is a custom component (`tour-tooltip.tsx`) styled with the
 * usual Tailwind tokens, so the only thing left for joyride to theme is the
 * chrome around it: the overlay, the spotlight cutout and the arrow. Colors use
 * CSS custom properties so tours stay legible in dark mode.
 *
 * `zIndex` is raised to 10000 so the spotlight/tooltip sit above the mobile
 * drawer (z-50) and the sticky topbar (z-40).
 */
export const LOCALE: Locale = {
  back: "Back",
  close: "Close",
  last: "Done",
  next: "Next",
  skip: "Skip tour",
};

export const BRAND_OPTIONS: Partial<Options> = {
  skipBeacon: true,
  zIndex: 10000,
  buttons: ["back", "skip", "primary"],
  primaryColor: "#0a196d",
  textColor: "var(--color-ink, #101828)",
  backgroundColor: "var(--color-paper, #ffffff)",
  arrowColor: "var(--color-paper, #ffffff)",
  overlayColor: "rgba(10, 15, 40, 0.55)",
  spotlightRadius: 14,
  // Interactive steps need clicks to reach the real UI through the cutout.
  blockTargetInteraction: false,
  // A stray overlay click shouldn't silently skip a step — the tooltip's own
  // Back / Skip / Next buttons are the only way through.
  overlayClickAction: false,
  // The custom tooltip draws its own progress rail and "Step N of M" line.
  showProgress: false,
};
