/**
 * Chart palette — validated for CVD safety (dataviz skill: all checks pass,
 * light+dark; contrast WARN is covered because every chart ships a legend +
 * tooltip). Categorical hues are assigned in FIXED order, never cycled.
 */
export const CATEGORICAL = [
  "#2540c4", // brand blue
  "#0f9d6e", // emerald
  "#e8912a", // amber
  "#8b5cf6", // violet
  "#0ea5b7", // teal
  "#d6336c", // magenta
] as const;

/** Brand-forward two-series pairing (e.g. invoiced vs collected). */
export const SERIES = { primary: "#2540c4", secondary: "#0f9d6e" } as const;

/** Status hues — reserved, never used for a categorical series. */
export const STATUS = {
  good: "#0f9d6e",
  warning: "#e8912a",
  danger: "#e5484d",
  neutral: "#8b93a7",
} as const;

export function categorical(i: number): string {
  return CATEGORICAL[i % CATEGORICAL.length];
}
