import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Self-contained assets for the HTML→PDF renderer. Everything is embedded as a
 * data URI so the headless-Chromium page has no network or file:// dependency —
 * fonts and the signature travel inside the HTML string. Read once, cached for
 * the life of the process.
 */

const FONT_DIR = path.join(process.cwd(), "src/lib/invoice/pdf/fonts");

function fontFace(file: string, weight: number): string | null {
  try {
    const b64 = fs.readFileSync(path.join(FONT_DIR, file)).toString("base64");
    return `@font-face{font-family:'NotoSans';font-style:normal;font-weight:${weight};src:url(data:font/ttf;base64,${b64}) format('truetype');}`;
  } catch {
    return null;
  }
}

/** A variable-font `@font-face` (one file spanning a weight range). */
function variableFontFace(file: string, family: string, weightRange: string): string | null {
  try {
    const b64 = fs.readFileSync(path.join(FONT_DIR, file)).toString("base64");
    return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weightRange};font-display:swap;src:url(data:font/ttf;base64,${b64}) format('truetype');}`;
  } catch {
    return null;
  }
}

let fontCss: string | null | undefined;
/**
 * `@font-face` blocks for the PDF: the site's own **Outfit** (body) and
 * **Space Grotesk** (display) so the printed document matches the on-screen
 * preview, plus **NotoSans** as the ₦-glyph fallback (Outfit/Space Grotesk lack
 * the Naira sign — Chromium falls back per-glyph). Cached for the process life.
 */
export function notoFontCss(): string {
  if (fontCss !== undefined) return fontCss ?? "";
  const faces = [
    fontFace("NotoSans-Regular.ttf", 400),
    fontFace("NotoSans-Bold.ttf", 700),
    variableFontFace("Outfit.ttf", "Outfit", "100 900"),
    variableFontFace("SpaceGrotesk.ttf", "Space Grotesk", "300 700"),
  ].filter(Boolean);
  fontCss = faces.length ? faces.join("") : null;
  return fontCss ?? "";
}

function dataUri(rel: string, mime: string): string | null {
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), rel));
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

let svgUri: string | null | undefined;
/** The traced signature as an SVG data URI — crisp at any size, for the HTML
 *  (Chromium) renderer. Null until `public/brand/signature.svg` exists. */
export function signatureSvgDataUri(): string | null {
  if (svgUri === undefined) svgUri = dataUri("public/brand/signature.svg", "image/svg+xml");
  return svgUri;
}

let pngUri: string | null | undefined;
/** Raster signature data URI for the @react-pdf fallback (which can't render
 *  SVG via <Image>). Null until `public/brand/signature.png` exists. */
export function signaturePngDataUri(): string | null {
  if (pngUri === undefined) pngUri = dataUri("public/brand/signature.png", "image/png");
  return pngUri;
}

let markUri: string | null | undefined;
/** The Litch mark as an SVG data URI — the SAME `public/brand/litch-mark.svg`
 *  the on-screen preview masks. Used as a CSS mask (not a filled path) so the
 *  file's `fill-rule="evenodd"` cuts the emblem out cleanly instead of filling a
 *  solid disc — that mismatch was the grey-circle watermark in the PDF. */
export function markSvgDataUri(): string | null {
  if (markUri === undefined) markUri = dataUri("public/brand/litch-mark.svg", "image/svg+xml");
  return markUri;
}
