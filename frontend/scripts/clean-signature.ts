/**
 * Clean a photographed signature into a transparent PNG for invoices/receipts.
 *
 *   node --import tsx scripts/clean-signature.ts "<raw image>" [out.png]
 *
 * Blue pen ink vs. beige paper can't be told apart by brightness (a darker
 * shadowed corner is as dark as a faint stroke), but it separates cleanly by
 * HUE: ink is blue (blue > red/green), paper is warm (blue < red/green). So the
 * alpha is built from "blueness" = b - (r+g)/2, which is immune to the lighting
 * gradient. We keep the natural ink colour (darkened a touch), trim and
 * downscale. Default output is public/brand/signature.png.
 */
import path from "node:path";
import sharp from "sharp";

const src = process.argv[2] ?? path.join(process.cwd(), "public/brand/signature-raw.png");
const out = process.argv[3] ?? path.join(process.cwd(), "public/brand/signature.png");

// Blueness band: <= LO fully clear (paper), >= HI fully opaque (ink).
const LO = 6;
const HI = 22;

const { data, info } = await sharp(src).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const rgba = Buffer.alloc(width * height * 4);

for (let i = 0, p = 0; i < data.length; i += channels, p += 4) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const blueness = b - (r + g) / 2;
  let a = 0;
  if (blueness >= HI) a = 255;
  else if (blueness > LO) a = Math.round((255 * (blueness - LO)) / (HI - LO));
  // Darken the ink a touch so it reads as a confident pen stroke on white.
  rgba[p] = Math.round(r * 0.72);
  rgba[p + 1] = Math.round(g * 0.72);
  rgba[p + 2] = Math.round(b * 0.82);
  rgba[p + 3] = a;
}

await sharp(rgba, { raw: { width, height, channels: 4 } })
  .trim({ threshold: 8 })
  .resize({ height: 220, withoutEnlargement: true })
  .png({ compressionLevel: 9 })
  .toFile(out);

console.log(`cleaned signature → ${out}`);
