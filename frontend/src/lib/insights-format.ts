/** Pure, client-safe helpers for Insights bodies (no server-only imports). */

/** Split a stored body into paragraph blocks (blank-line separated). */
export function splitBody(text: string): string[] {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** ~200 wpm reading estimate, floored at 1 minute. */
export function estimateReadMins(text: string): number {
  const words = (text || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** URL-safe slug from a title (or an edited slug field). */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
