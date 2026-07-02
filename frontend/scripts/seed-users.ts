/**
 * Seed initial users via Better Auth (proper password hashing), then promote
 * admins. Run: `node --env-file=../.env --import tsx ./scripts/seed-users.ts`
 * (from the frontend/ dir).
 */
import { auth } from "../src/lib/auth";
import { Pool } from "pg";

const USERS = [
  { email: "admin@litchconsulting.com", name: "Litch Admin", password: "Password123!", role: "admin" },
  { email: "wedigcreativity@gmail.com", name: "WeDig Creativity", password: "Password123!", role: "admin" },
  { email: "client@litchconsulting.com", name: "Litch Client", password: "Password123!", role: "client" },
];

function ssl() {
  const cert = process.env.COCKROACH_CA_CERT || process.env.COCKROACHDB_CERT;
  return cert && cert.includes("BEGIN CERTIFICATE")
    ? { ca: cert, rejectUnauthorized: true as const }
    : { rejectUnauthorized: true as const };
}

async function main() {
  for (const u of USERS) {
    try {
      await auth.api.signUpEmail({ body: { email: u.email, password: u.password, name: u.name } });
      console.log("✓ created", u.email);
    } catch (e) {
      console.log("• exists/skip", u.email, e instanceof Error ? e.message : String(e));
    }
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.COCKROACHDB_URL,
    ssl: ssl(),
  });
  for (const u of USERS) {
    const res = await pool.query('UPDATE "user" SET role = $1 WHERE email = $2', [u.role, u.email]);
    console.log(`  role=${u.role} → ${u.email} (${res.rowCount} row)`);
  }
  await pool.end();
  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
