import { defineConfig } from "drizzle-kit";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Resolve the CockroachDB CA cert: inline env PEM → committed file → the
// default `~/.postgresql/root.crt` written by the cluster's download command.
function ca(): string | undefined {
  const env = process.env.COCKROACH_CA_CERT || process.env.COCKROACH_CERT;
  if (env && env.includes("BEGIN CERTIFICATE")) return env;
  for (const f of [
    path.join(process.cwd(), "certs", "cockroach-ca.crt"),
    path.join(os.homedir(), ".postgresql", "root.crt"),
  ]) {
    try {
      return fs.readFileSync(f, "utf8");
    } catch {}
  }
  return undefined;
}

// Drizzle manages only the Litch app tables (see src/lib/db/schema.ts).
// Better Auth's user/session/account/verification tables are created and
// migrated by the Better Auth CLI, so they are intentionally not defined here.
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: (process.env.DATABASE_URL || process.env.COCKROACHDB_URL) as string,
    ssl: { ca: ca(), rejectUnauthorized: true },
  },
});
