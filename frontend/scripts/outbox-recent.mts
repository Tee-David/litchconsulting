/** READ ONLY: the last outbox rows (no addresses printed, only the domain). */
import fs from "node:fs";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || process.env.COCKROACHDB_URL, ssl: { ca: fs.readFileSync("certs/cockroach-ca.crt", "utf8") } });
try {
  const rows = (await pool.query(`SELECT * FROM email_outbox ORDER BY created_at DESC LIMIT 12`)).rows;
  for (const r of rows) {
    const to = String(r.to ?? r.to_address ?? "").replace(/^[^@]*/, "***");
    const keys = Object.keys(r).filter((k) => /status|attempt|created|updated|sent|error|subject/.test(k));
    console.log(to, JSON.stringify(Object.fromEntries(keys.map((k) => [k, k === "subject" ? String(r[k]).slice(0, 40) : r[k]]))));
  }
} finally { await pool.end(); }
