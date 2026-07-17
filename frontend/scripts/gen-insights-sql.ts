/**
 * Emit the curated Insights articles as paste-able SQL.
 *
 *   npx esbuild scripts/gen-insights-sql.ts --bundle --platform=node --format=esm \
 *     --packages=external --alias:@=./src --outfile=/tmp/g.mjs && node /tmp/g.mjs
 *
 * Port 26257 is blocked on this network, so the seeder can't connect directly —
 * but the CockroachDB Cloud SQL Shell (browser, over HTTPS) can. This writes
 * scripts/sql/seed-insights.sql to paste there instead.
 *
 * Idempotent: ON CONFLICT (slug) DO NOTHING, so re-running never clobbers edits
 * made in the admin.
 */
import { writeFileSync } from "node:fs";
import { insights } from "../src/lib/content";

// Dollar-quoting sidesteps escaping entirely — the bodies contain apostrophes,
// ₦ signs and em-dashes that single-quote escaping gets wrong.
const tag = (s: string, i: number) => {
  let t = `$b${i}$`;
  while (s.includes(t)) t = `$b${i}x$`;
  return t;
};
const q = (s: string, i: number) => {
  const t = tag(s, i);
  return `${t}${s}${t}`;
};

const rows = insights.posts.map((p, i) => {
  const body = p.body.join("\n\n");
  return `INSERT INTO "post" (slug, title, tag, excerpt, cover_image, author, body, status, read_mins, seo_title, seo_description, published_at)
VALUES (${q(p.slug, i)}, ${q(p.title, i)}, ${q(p.tag, i)}, ${q(p.excerpt, i)}, ${q(p.image, i)}, ${q(p.author, i)}, ${q(body, i)}, 'published', ${p.readMins}, ${q(`${p.title} | Litch Consulting`, i)}, ${q(p.excerpt, i)}, '${p.date}')
ON CONFLICT (slug) DO NOTHING;`;
});

const sql = [
  "-- Seed the curated Insights articles as real, editable CMS posts.",
  "-- Paste into the CockroachDB SQL Shell (defaultdb).",
  "-- Idempotent: ON CONFLICT (slug) DO NOTHING — safe to re-run, never clobbers admin edits.",
  "",
  ...rows,
  "",
  "-- Verify:",
  `SELECT slug, title, status, published_at FROM "post" ORDER BY published_at DESC;`,
].join("\n\n");

writeFileSync("scripts/sql/seed-insights.sql", sql + "\n");
console.log(`wrote scripts/sql/seed-insights.sql — ${insights.posts.length} articles`);
