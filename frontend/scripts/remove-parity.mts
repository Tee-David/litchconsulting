/**
 * Removes the visual-parity test accounts (parity-*-<suffix>@example.com) and the
 * "Parity Check client (temp)" client, as planned in the launch checklist. Only
 * rows tied to those accounts are touched. Run after a backup.
 *
 *   node --env-file=.env.local --import tsx scripts/remove-parity.mts
 */
import fs from "node:fs";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || process.env.COCKROACHDB_URL,
  ssl: { ca: fs.readFileSync("certs/cockroach-ca.crt", "utf8") },
});
const q = (s: string, v: unknown[] = []) => pool.query(s, v);
try {
  const users = (await q(`SELECT id FROM "user" WHERE email LIKE 'parity-%@example.com'`)).rows.map((r) => r.id as string);
  const clients = (await q(`SELECT id FROM client WHERE name = 'Parity Check client (temp)'
      OR email LIKE 'parity-%@example.com'`)).rows.map((r) => r.id as string);
  const busy = (await q(`SELECT (SELECT count(*)::int FROM invoice WHERE client_id = ANY($1)) +
      (SELECT count(*)::int FROM service_request WHERE client_id = ANY($1)) AS n`, [clients])).rows[0].n;
  if (busy > 0) throw new Error(`the parity client has ${busy} invoices or requests: stop and check`);
  const run = async (sql: string, v: unknown[]) => (await q(sql, v).catch(() => ({ rowCount: 0 }))).rowCount;
  const out: Record<string, unknown> = {};
  out.members = await run(`DELETE FROM client_member WHERE client_id = ANY($1) OR user_id = ANY($2)`, [clients, users]);
  out.invitations = await run(`DELETE FROM invitation WHERE client_id = ANY($1)`, [clients]);
  out.notes = await run(`DELETE FROM client_note WHERE client_id = ANY($1)`, [clients]);
  out.clients = await run(`DELETE FROM client WHERE id = ANY($1)`, [clients]);
  await run(`DELETE FROM sage_message WHERE conversation_id IN (SELECT id FROM sage_conversation WHERE user_id = ANY($1))`, [users]);
  for (const t of [`session_two_step WHERE user_id`, `"twoFactor" WHERE "userId"`, `session WHERE "userId"`,
    `account WHERE "userId"`, `user_onboarding WHERE user_id`, `notification WHERE user_id`,
    `notification_pref WHERE user_id`, `push_subscription WHERE user_id`, `sage_conversation WHERE user_id`,
    `request_draft WHERE user_id`, `request_assignment WHERE user_id`, `two_step_exemption WHERE user_id`])
    await run(`DELETE FROM ${t} = ANY($1)`, [users]);
  out.users = await run(`DELETE FROM "user" WHERE id = ANY($1)`, [users]);
  console.log("removed", JSON.stringify(out));
} finally {
  await pool.end();
}
