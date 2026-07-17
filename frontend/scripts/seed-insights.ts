/**
 * Seed the curated Insights articles into the `post` table so they become real,
 * editable CMS articles in /admin/blog — instead of hardcoded copy in
 * content.ts that an admin can't touch.
 *
 *   node --env-file=.env.local --import tsx scripts/seed-insights.ts
 *
 * Idempotent: upserts on slug. Existing rows are left alone by default so a
 * re-run never clobbers edits made in the admin; pass --force to overwrite.
 *
 * `getAllInsights()` already merges DB posts over the curated list by slug, so
 * once seeded the DB copy is what the public /insights pages render.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { insights } from "../src/lib/content";

function ssl() {
  // Always verify against the committed CA (operator directive).
  const cert = process.env.COCKROACH_CA_CERT || process.env.COCKROACHDB_CERT;
  if (cert && cert.includes("BEGIN CERTIFICATE")) return { ca: cert, rejectUnauthorized: true as const };
  return {
    ca: readFileSync(join(process.cwd(), "certs", "cockroach-ca.crt"), "utf8"),
    rejectUnauthorized: true as const,
  };
}

const force = process.argv.includes("--force");

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.COCKROACHDB_URL,
    ssl: ssl(),
    connectionTimeoutMillis: 15_000,
  });

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const p of insights.posts) {
    // The CMS stores the body as plain text: paragraphs separated by blank lines.
    const body = p.body.join("\n\n");
    const existing = await pool.query<{ id: string }>(`SELECT id FROM "post" WHERE slug = $1`, [p.slug]);

    if (existing.rowCount && !force) {
      skipped++;
      continue;
    }

    if (existing.rowCount) {
      await pool.query(
        `UPDATE "post" SET title=$2, tag=$3, excerpt=$4, cover_image=$5, author=$6, body=$7,
           read_mins=$8, status='published', published_at=$9, updated_at=now() WHERE slug=$1`,
        [p.slug, p.title, p.tag, p.excerpt, p.image, p.author, body, p.readMins, new Date(p.date)],
      );
      updated++;
    } else {
      await pool.query(
        `INSERT INTO "post" (slug, title, tag, excerpt, cover_image, author, body, status, read_mins,
           seo_title, seo_description, published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'published',$8,$9,$10,$11)`,
        [
          p.slug,
          p.title,
          p.tag,
          p.excerpt,
          p.image,
          p.author,
          body,
          p.readMins,
          `${p.title} | Litch Consulting`,
          p.excerpt,
          new Date(p.date),
        ],
      );
      inserted++;
    }
  }

  await pool.end();
  console.log(
    `insights seeded → inserted ${inserted}, updated ${updated}, skipped ${skipped}` +
      (skipped && !force ? " (already present — re-run with --force to overwrite)" : ""),
  );
}

main().catch((err) => {
  console.error("seed-insights failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
