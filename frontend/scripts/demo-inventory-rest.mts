/** READ ONLY: the clients, invoices and requests that are NOT QA demo, and the last
 * sign-in of the seed logins, so a person can judge what is real. */
import fs from "node:fs";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || process.env.COCKROACHDB_URL,
  ssl: { ca: fs.readFileSync("certs/cockroach-ca.crt", "utf8") },
});
const q = async (s: string, v: unknown[] = []) => (await pool.query(s, v)).rows;
try {
  const rest = await q(`SELECT c.name, c."created_at"::date AS made,
      (SELECT count(*)::int FROM invoice i WHERE i.client_id = c.id) AS invoices,
      (SELECT count(*)::int FROM service_request r WHERE r.client_id = c.id) AS requests
    FROM client c WHERE c.notes IS NULL OR c.notes NOT LIKE '[QA demo]%' ORDER BY c.name`).catch(
    async () => q(`SELECT c.name,
      (SELECT count(*)::int FROM invoice i WHERE i.client_id = c.id) AS invoices,
      (SELECT count(*)::int FROM service_request r WHERE r.client_id = c.id) AS requests
    FROM client c WHERE c.notes IS NULL OR c.notes NOT LIKE '[QA demo]%' ORDER BY c.name`));
  console.log("Clients that are not QA demo:");
  for (const c of rest) console.log("  ", c.name, "| invoices", c.invoices, "| requests", c.requests);
  const seen = await q(`SELECT u.email, max(s."createdAt")::date AS last_session
    FROM "user" u LEFT JOIN session s ON s."userId" = u.id
    WHERE u.email IN ('admin@litchconsulting.com','client@litchconsulting.com','testadmin@litchconsulting.com')
    GROUP BY u.email ORDER BY u.email`);
  console.log("Seed logins, last sign-in:");
  for (const s of seen) console.log("  ", s.email, String(s.last_session ?? "never").slice(0, 15));
  const unattached = await q(`SELECT count(*)::int AS n FROM invoice WHERE client_id IS NULL`);
  console.log("Invoices with no client:", unattached[0].n);
} finally {
  await pool.end();
}
