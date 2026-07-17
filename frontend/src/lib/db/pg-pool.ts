import { Pool, type PoolConfig } from "pg";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The one CockroachDB connection pool for the whole app — shared by Drizzle
 * (`client.ts`) and Better Auth (`auth.ts`). One pool, not two: CockroachDB
 * serverless caps concurrent connections, and two `max: 5` pools was 10 sockets
 * competing for that cap.
 *
 * TLS: always pin the committed CA cert (operator directive). Order is env →
 * bundled file (`certs/cockroach-ca.crt`, shipped via next.config
 * outputFileTracingIncludes) → the local `~/.postgresql` cert. System CAs are a
 * last-resort only so a missing cert degrades instead of taking auth down.
 */
export function resolveSSL() {
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
  console.warn("[db] CockroachDB CA cert not found — falling back to system CAs");
  return { rejectUnauthorized: true as const };
}

/**
 * Resiliency is the point of this config. Without `connectionTimeoutMillis`, a
 * slow connect — a flaky network hop, or a serverless cluster waking from idle —
 * hangs on the OS TCP timeout (~2 min). Those hung requests pile up and surface
 * as "a server error occurred" across pages. So: fail fast, recycle idle/stale
 * connections rather than reuse a dead one, keepalive to detect drops, and never
 * let a background idle-client error crash the process.
 */
function makePool(): Pool {
  const config: PoolConfig = {
    connectionString: process.env.DATABASE_URL || process.env.COCKROACHDB_URL,
    ssl: resolveSSL(),
    max: 8,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    maxUses: 7_500,
    keepAlive: true,
    statement_timeout: 20_000,
    query_timeout: 20_000,
  };
  const pool = new Pool(config);
  // An idle client can emit 'error' when CockroachDB drops the socket; with no
  // listener Node treats it as unhandled and crashes the process. Log it and
  // let the pool discard the client — the next acquire opens a fresh one.
  pool.on("error", (err) => console.error("[db] idle client error:", err.message));
  return pool;
}

/** Singleton across dev HMR and warm serverless invocations. */
const globalForDb = globalThis as unknown as { __litchPool?: Pool };
export const pool = globalForDb.__litchPool ?? makePool();
globalForDb.__litchPool = pool;
