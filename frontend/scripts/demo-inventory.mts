/**
 * READ ONLY. Lists what looks like demo or test data, so a person can confirm
 * before anything is deleted. Prints counts and labels only (no passwords, no
 * personal data beyond the test accounts' own emails).
 *
 *   node --env-file=.env.local --import tsx scripts/demo-inventory.mts
 */
import fs from "node:fs";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || process.env.COCKROACHDB_URL,
  ssl: { ca: fs.readFileSync("certs/cockroach-ca.crt", "utf8") },
});
const q = async (s: string, v: unknown[] = []) => (await pool.query(s, v)).rows;

try {
  const mark = "[QA demo]%";
  const clients = await q(`SELECT id, name FROM client WHERE notes LIKE $1`, [mark]);
  const ids = clients.map((c) => c.id);
  const count = async (t: string, where: string, v: unknown[]) =>
    (await q(`SELECT count(*)::int AS n FROM ${t} WHERE ${where}`, v))[0].n as number;
  console.log("QA demo clients:", clients.length, clients.map((c) => c.name).join(" | "));
  console.log("  requests:", await count("service_request", "client_id = ANY($1)", [ids]));
  console.log("  invoices:", await count("invoice", "client_id = ANY($1)", [ids]));
  console.log("  tickets:", await count("ticket", "client_id = ANY($1)", [ids]));
  console.log("  expenses (QA-DEMO):", await count("expense", "reference = 'QA-DEMO'", []));
  const users = await q(
    `SELECT email, role, "createdAt"::date AS made FROM "user"
     WHERE email ILIKE '%@example.com' OR email ILIKE 'qa.%' OR email ILIKE '%parity%'
        OR email ILIKE '%test%' OR email ILIKE '%demo%' OR name ILIKE '%(QA %'
        OR email IN ('admin@litchconsulting.com','client@litchconsulting.com','wedigcreativity@gmail.com')
     ORDER BY email`);
  console.log("Test-looking user accounts:", users.length);
  for (const u of users) console.log("  ", u.email, u.role, String(u.made).slice(0, 10));
  const otherClients = await q(
    `SELECT name, email FROM client WHERE (notes IS NULL OR notes NOT LIKE $1)
       AND (email ILIKE '%@example.com' OR name ILIKE '%demo%' OR name ILIKE '%test%' OR name ILIKE '%(QA%')`,
    [mark]);
  console.log("Other test-looking clients (not marked):", otherClients.length);
  for (const c of otherClients) console.log("  ", c.name, c.email);
  const all = await q(`SELECT
     (SELECT count(*)::int FROM client) AS clients, (SELECT count(*)::int FROM invoice) AS invoices,
     (SELECT count(*)::int FROM service_request) AS requests, (SELECT count(*)::int FROM "user") AS users,
     (SELECT count(*)::int FROM ticket) AS tickets, (SELECT count(*)::int FROM post) AS posts`);
  console.log("Whole database:", JSON.stringify(all[0]));
} finally {
  await pool.end();
}
