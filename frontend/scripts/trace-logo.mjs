/**
 * One-off: pixel-trace the Litch logo raster (plans/logo.png) into SVGs,
 * recoloured to brand blue. Produces:
 *   public/brand/litch-logo-source.png  (copy of the source)
 *   public/brand/litch-logo.svg         (full lockup: emblem + wordmark)
 *   public/brand/litch-mark.svg         (emblem only)
 *   src/app/icon.svg                     (favicon = emblem)
 *   src/app/apple-icon.png               (180px emblem)
 *
 * Uses the JS `potrace` package + `sharp` (no system binaries needed).
 * Run: node scripts/trace-logo.mjs
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import potrace from "potrace";

const BLUE = "#0a196d";
const ROOT = process.cwd();
const SRC = path.resolve(ROOT, "..", "plans", "logo.png");
const BRAND = path.join(ROOT, "public", "brand");
const APP = path.join(ROOT, "src", "app");

const trace = (buf, opts) =>
  new Promise((res, rej) =>
    potrace.trace(buf, opts, (err, svg) => (err ? rej(err) : res(svg))),
  );

const OPTS = {
  color: BLUE,
  background: "transparent",
  threshold: 160, // maroon art is dark → foreground; white flatten → background
  turdSize: 2, // keep fine detail (keyhole, letter cuts)
  optCurve: true,
  optTolerance: 0.2,
};

await fs.mkdir(BRAND, { recursive: true });
await fs.copyFile(SRC, path.join(BRAND, "litch-logo-source.png"));

const meta = await sharp(SRC).metadata();

// Full lockup: flatten transparency onto white so only the artwork is dark.
const fullBuf = await sharp(SRC).flatten({ background: "#ffffff" }).png().toBuffer();
const fullSvg = await trace(fullBuf, OPTS);
await fs.writeFile(path.join(BRAND, "litch-logo.svg"), fullSvg);

// Emblem: crop the circular mark (left ~square), then (separate pass) trim + trace.
const markW = Math.min(Math.round(meta.height * 0.93), meta.width); // avoid the divider
const emblemCrop = await sharp(SRC)
  .extract({ left: 0, top: 0, width: markW, height: meta.height })
  .png()
  .toBuffer();
const markBuf = await sharp(emblemCrop).flatten({ background: "#ffffff" }).trim().png().toBuffer();
const markSvg = await trace(markBuf, OPTS);
await fs.writeFile(path.join(BRAND, "litch-mark.svg"), markSvg);

// Favicon + apple icon from the emblem crop.
await fs.copyFile(path.join(BRAND, "litch-mark.svg"), path.join(APP, "icon.svg"));
const emblemTrimmed = await sharp(emblemCrop).trim().png().toBuffer();
await sharp(emblemTrimmed)
  .resize(180, 180, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
  .png()
  .toFile(path.join(APP, "apple-icon.png"));

const vb = (s) => (s.match(/viewBox="[^"]*"/) || [])[0] || "(no viewBox)";
console.log("source:", meta.width + "x" + meta.height);
console.log("full lockup:", vb(fullSvg), `(${fullSvg.length} bytes)`);
console.log("emblem:", vb(markSvg), `(${markSvg.length} bytes)`);
