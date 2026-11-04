/**
 * Restore a JSON DB snapshot (written by /api/cron/backup) — restore DRILL.
 *
 *   node --env-file=.env.local --import tsx scripts/restore-backup.ts            # latest snapshot
 *   node --env-file=.env.local --import tsx scripts/restore-backup.ts --key backups/db/2026/….json
 *   … --keep        keep the scratch database afterwards (default: drop it)
 *
 * Safety: it ONLY restores into a fresh scratch database
 * (`litch_restore_<timestamp>`) on the same cluster, built with the real schema
 * from apply-schema.ts. It never writes to the production database. A real
 * disaster recovery is the same procedure pointed at a new database, followed
 * by switching COCKROACHDB_URL — do that deliberately, by hand.
 *
 * Output: per-table row counts (snapshot vs restored) and PASS/FAIL.
 */
import { Pool } from "pg";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { STATEMENTS, ssl } from "./apply-schema";

// Parent tables first so foreign keys are satisfied (matches the backup order).
const ORDER = [
  "client", "invoice", "invoice_item", "service_offering", "service_request",
  "service_request_event", "service_request_document", "payment", "consultation",
  "ticket", "ticket_message", "template", "post", "expense", "org_settings",
  "client_note", "lead",
];

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};

function r2() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey || !process.env.R2_PRIVATE_BUCKET) {
    throw new Error("R2 credentials / R2_PRIVATE_BUCKET not set");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function latestKey(s3: S3Client, bucket: string): Promise<string> {
  let token: string | undefined;
  let best: { key: string; at: number } | null = null;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: "backups/db/", ContinuationToken: token }),
    );
    for (const o of page.Contents ?? []) {
      const at = o.LastModified?.getTime() ?? 0;
      if (o.Key?.endsWith(".json") && (!best || at > best.at)) best = { key: o.Key, at };
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  if (!best) throw new Error("No snapshots found under backups/db/");
  return best.key;
}

function withDatabase(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

async function main() {
  const baseUrl = process.env.COCKROACHDB_URL || process.env.DATABASE_URL;
  if (!baseUrl) throw new Error("COCKROACHDB_URL / DATABASE_URL not set");
  const bucket = process.env.R2_PRIVATE_BUCKET!;
  const s3 = r2();

  const key = arg("--key") ?? (await latestKey(s3, bucket));
  console.log(`snapshot: ${key}`);
  const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const doc = JSON.parse(await obj.Body!.transformToString()) as {
    generatedAt: string;
    tables: Record<string, number>;
    snapshot: Record<string, unknown[]>;
  };
  console.log(`taken at: ${doc.generatedAt}`);

  const scratch = `litch_restore_${Date.now()}`;
  const admin = new Pool({ connectionString: baseUrl, ssl: ssl() });
  await admin.query(`CREATE DATABASE "${scratch}"`);
  console.log(`scratch database: ${scratch}`);

  const pool = new Pool({ connectionString: withDatabase(baseUrl, scratch), ssl: ssl() });
  let ok = true;
  try {
    for (const stmt of STATEMENTS) await pool.query(stmt);
    console.log(`schema applied (${STATEMENTS.length} statements)`);

    const tables = [...ORDER, ...Object.keys(doc.snapshot).filter((t) => !ORDER.includes(t))];
    for (const t of tables) {
      const rows = doc.snapshot[t] ?? [];
      if (rows.length) {
        // json_populate_recordset maps by column name and casts each value to
        // the column's type, so the snapshot needs no per-table code.
        await pool.query(
          `INSERT INTO "${t}" SELECT * FROM json_populate_recordset(NULL::"${t}", $1::json)`,
          [JSON.stringify(rows)],
        );
      }
      const { rows: c } = await pool.query(`SELECT count(*)::int AS n FROM "${t}"`);
      const want = doc.tables[t] ?? rows.length;
      // count() is INT8 in CockroachDB; node-postgres returns it as a string.
      const got = Number(c[0].n);
      const pass = got === want;
      ok &&= pass;
      console.log(`  ${pass ? "✓" : "✗"} ${t.padEnd(26)} snapshot ${String(want).padStart(5)}  restored ${String(got).padStart(5)}`);
    }
  } finally {
    await pool.end();
    if (process.argv.includes("--keep")) {
      console.log(`kept ${scratch} (drop it later: DROP DATABASE "${scratch}" CASCADE)`);
    } else {
      await admin.query(`DROP DATABASE "${scratch}" CASCADE`);
      console.log(`dropped ${scratch}`);
    }
    await admin.end();
  }
  console.log(ok ? "RESTORE DRILL: PASS" : "RESTORE DRILL: FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  process.exit(1);
});
