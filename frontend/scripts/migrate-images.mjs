/**
 * One-off: download every stock image referenced in the code and upload it to
 * the R2 bucket under `assets/<id>.jpg`, so the site serves its own fast,
 * self-hosted images instead of hotlinking stock photos.
 *
 * Run with R2 creds in env:  node scripts/migrate-images.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY;
const bucket = process.env.R2_BUCKET_NAME;

if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  console.error("Missing R2 env (R2_ACCOUNT_ID / R2_ACCESS_KEY / R2_SECRET_KEY / R2_BUCKET_NAME)");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

function walk(dir, acc = []) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(f)) acc.push(p);
  }
  return acc;
}

const ids = new Set();
for (const f of walk("src")) {
  const txt = readFileSync(f, "utf8");
  for (const m of txt.matchAll(/photo-([0-9a-f-]+)/g)) ids.add(m[1]);
  for (const m of txt.matchAll(/U\("([0-9a-f-]+)"/g)) ids.add(m[1]);
}
console.log(`Found ${ids.size} unique images.`);

let ok = 0;
let fail = 0;
for (const id of ids) {
  const key = `assets/${id}.jpg`;
  const url = `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=82`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buf,
        ContentType: "image/jpeg",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    ok++;
    console.log(`✓ ${key}  ${(buf.length / 1024) | 0}KB`);
  } catch (e) {
    fail++;
    console.error(`✗ ${id}  ${e.message}`);
  }
}
console.log(`\nDone: ${ok} uploaded, ${fail} failed.`);
