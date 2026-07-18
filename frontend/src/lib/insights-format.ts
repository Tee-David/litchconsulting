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

/** True once a body carries real HTML (WYSIWYG output) vs the markdown subset. */
export function isHtmlBody(s: string): boolean {
  return /<(p|h[1-6]|ul|ol|li|img|a|strong|em|blockquote|br|figure)\b/i.test(s || "");
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inlineBold = (s: string) =>
  escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

/** Convert the legacy markdown subset (## / # headings, - bullets, **bold**,
 *  paragraphs) to HTML so a pre-WYSIWYG post opens cleanly in the tiptap editor.
 *  Only used on load; new content is authored as HTML directly. */
export function mdSubsetToHtml(md: string): string {
  if (isHtmlBody(md)) return md;
  return splitBody(md)
    .map((block) => {
      const lines = block.split("\n").filter((l) => l.trim());
      if (lines.length > 0 && lines.every((l) => l.trim().startsWith("- "))) {
        return `<ul>${lines.map((l) => `<li>${inlineBold(l.trim().slice(2))}</li>`).join("")}</ul>`;
      }
      if (block.startsWith("## ")) return `<h2>${inlineBold(block.slice(3))}</h2>`;
      if (block.startsWith("# ")) return `<h2>${inlineBold(block.slice(2))}</h2>`;
      return `<p>${inlineBold(block)}</p>`;
    })
    .join("");
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
