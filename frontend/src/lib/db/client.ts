import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as schema from "./schema";

/**
 * Drizzle client on the same CockroachDB Better Auth uses. SSL/CA resolution
 * mirrors lib/auth.ts (env cert → committed cert → system CAs).
 */
function resolveSSL() {
  const envCert =
    process.env.COCKROACH_CA_CERT || process.env.COCKROACH_CERT || process.env.COCKROACHDB_CERT;
  if (envCert && envCert.includes("BEGIN CERTIFICATE")) {
    return { ca: envCert, rejectUnauthorized: true as const };
  }
  for (const f of [
    path.join(process.cwd(), "certs", "cockroach-ca.crt"),
    path.join(os.homedir(), ".postgresql", "root.crt"),
  ]) {
    try {
      return { ca: fs.readFileSync(f, "utf8"), rejectUnauthorized: true as const };
    } catch {}
  }
  return { rejectUnauthorized: true as const };
}

const globalForDb = globalThis as unknown as { __litchPool?: Pool };
const pool =
  globalForDb.__litchPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL || process.env.COCKROACHDB_URL,
    ssl: resolveSSL(),
    max: 5,
  });
if (process.env.NODE_ENV !== "production") globalForDb.__litchPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
