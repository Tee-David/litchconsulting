// Usage: node --env-file=../.env --import tsx users.ts create|delete <stateFile>
import pg from "pg";
import fs from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
const [mode, stateFile] = process.argv.slice(2);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || process.env.COCKROACHDB_URL, ssl: { ca: fs.readFileSync("certs/cockroach-ca.crt", "utf8") } });
const q = (s: string, v: unknown[] = []) => pool.query(s, v);
if (mode === "create") {
  const pw = "Pc!" + randomBytes(12).toString("base64url");
  const hash = await hashPassword(pw);
  const tag = randomBytes(3).toString("hex");
  const users: Record<string, { id: string; email: string }> = {};
  for (const role of ["admin", "staff", "client"]) {
    const id = randomUUID(); const email = `parity-${role}-${tag}@example.com`; const now = new Date();
    await q(`INSERT INTO "user" (id,name,email,"emailVerified",role,banned,"createdAt","updatedAt") VALUES ($1,$2,$3,true,$4,false,$5,$5)`, [id, `Parity Check ${role} (temp)`, email, role, now]);
    await q(`INSERT INTO account (id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES ($1,$2,'credential',$2,$3,$4,$4)`, [randomUUID(), id, hash, now]);
    users[role] = { id, email };
  }
  const req = (await q(`SELECT id FROM service_request WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1`)).rows[0];
  const cli = (await q(`SELECT id FROM client WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1`)).rows[0];
  let assignment = null;
  if (req) { const r = await q(`INSERT INTO request_assignment (request_id,user_id) VALUES ($1,$2) RETURNING id`, [req.id, users.staff.id]).catch((e) => ({ rows: [{ err: e.message }] })); assignment = r.rows[0]; }
  fs.writeFileSync(stateFile, JSON.stringify({ pw, users, requestId: req?.id, clientId: cli?.id, assignment }, null, 1));
  console.log("created", Object.values(users).map((u) => u.email).join(", "), "request", req?.id, "client", cli?.id, "assignment", JSON.stringify(assignment));
} else {
  const st = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  const ids = Object.values(st.users as Record<string, { id: string }>).map((u) => u.id);
  const del = async (sql: string) => { try { const r = await q(sql, [ids]); return r.rowCount; } catch (e) { return "skip: " + (e as Error).message.slice(0, 60); } };
  const out: Record<string, unknown> = {};
  out.assign = await del(`DELETE FROM request_assignment WHERE user_id = ANY($1)`);
  out.two = await del(`DELETE FROM session_two_step WHERE user_id = ANY($1)`);
  out.tf = await del(`DELETE FROM "twoFactor" WHERE "userId" = ANY($1)`);
  out.sess = await del(`DELETE FROM session WHERE "userId" = ANY($1)`);
  out.acct = await del(`DELETE FROM account WHERE "userId" = ANY($1)`);
  out.onb = await del(`DELETE FROM user_onboarding WHERE user_id = ANY($1)`);
  out.notif = await del(`DELETE FROM notification WHERE user_id = ANY($1)`);
  out.prefs = await del(`DELETE FROM notification_pref WHERE user_id = ANY($1)`);
  out.member = await del(`DELETE FROM client_member WHERE user_id = ANY($1)`);
  out.client = await del(`DELETE FROM client WHERE user_id = ANY($1)`);
  out.audit = await del(`DELETE FROM audit_log WHERE actor_id = ANY($1) OR entity_id = ANY($1)`);
  out.user = await del(`DELETE FROM "user" WHERE id = ANY($1)`);
  console.log("deleted", JSON.stringify(out));
}
await pool.end();
