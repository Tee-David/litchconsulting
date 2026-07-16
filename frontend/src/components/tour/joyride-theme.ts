import type { Locale, Options, PartialDeep, Styles } from "react-joyride";

/**
 * Brand theme for react-joyride, extracted verbatim from the original
 * `portal-tour.tsx` so every tour looks identical. The one deliberate change is
 * `zIndex`, raised to 10000 so the spotlight/tooltip sits above the mobile
 * drawer (z-50) and topbar (z-40). Colors use CSS custom properties so tours
 * stay legible in dark mode.
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
  showProgress: true,
  scrollOffset: 96,
  zIndex: 10000,
  buttons: ["back", "skip", "primary"],
  primaryColor: "#0a196d",
  textColor: "var(--color-ink, #101828)",
  backgroundColor: "var(--color-paper, #ffffff)",
  arrowColor: "var(--color-paper, #ffffff)",
  overlayColor: "rgba(10, 15, 40, 0.55)",
  spotlightRadius: 14,
};

export const BRAND_STYLES: PartialDeep<Styles> = {
  tooltip: { borderRadius: 16, padding: 18 },
  tooltipTitle: { fontWeight: 700, fontSize: 15 },
  tooltipContent: { fontSize: 13.5, lineHeight: 1.55, padding: "10px 0 0" },
  buttonPrimary: { borderRadius: 9999, padding: "9px 18px", fontWeight: 600, fontSize: 13 },
  buttonBack: { fontSize: 13 },
  buttonSkip: { fontSize: 13 },
};
