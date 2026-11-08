// Mint short test sessions for the temporary parity users (deleted with them). Copy into frontend/ as _ps.mts to run.
import pg from "pg"; import fs from "node:fs"; import { randomUUID, randomBytes, createHmac } from "node:crypto";
const stateFile = process.argv[2]; const st = JSON.parse(fs.readFileSync(stateFile, "utf8"));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || process.env.COCKROACHDB_URL, ssl: { ca: fs.readFileSync("certs/cockroach-ca.crt", "utf8") } });
st.cookies = {};
for (const role of ["admin", "staff", "client"]) {
  const u = st.users[role]; const now = new Date(); const id = randomUUID(); const token = randomBytes(24).toString("base64url");
  await pool.query(`INSERT INTO session (id, token, "userId", "expiresAt", "createdAt", "updatedAt", "ipAddress", "userAgent") VALUES ($1,$2,$3,$4,$5,$5,'127.0.0.1','parity-check')`, [id, token, u.id, new Date(Date.now() + 7200_000), now]);
  if (role !== "client") { await pool.query(`UPDATE "user" SET "twoFactorEnabled" = true WHERE id = $1`, [u.id]); await pool.query(`INSERT INTO session_two_step (session_id, user_id) VALUES ($1,$2)`, [id, u.id]); }
  st.cookies[role] = encodeURIComponent(`${token}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(token).digest("base64")}`);
}
st.requestId = (await pool.query(`SELECT id FROM service_request WHERE number='REQ-2026-003'`)).rows[0]?.id ?? st.requestId;
st.clientId = (await pool.query(`SELECT id FROM client WHERE company='Kanem Logistics Nigeria Ltd'`)).rows[0]?.id ?? st.clientId;
fs.writeFileSync(stateFile, JSON.stringify(st, null, 1)); console.log("sessions ok"); await pool.end();
