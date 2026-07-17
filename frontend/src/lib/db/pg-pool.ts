import { Pool, type PoolConfig } from "pg";
import { COCKROACH_CA_PEM } from "./cockroach-ca";

/**
 * The one CockroachDB connection pool for the whole app — shared by Drizzle
 * (`client.ts`) and Better Auth (`auth.ts`). One pool, not two: CockroachDB
 * serverless caps concurrent connections, and two `max: 5` pools was 10 sockets
 * competing for that cap.
 *
 * TLS: the CA is ALWAYS used (operator directive) and is imported as a module
 * (`cockroach-ca.ts`, generated from certs/cockroach-ca.crt) — never read from
 * disk or env at runtime. DATABASE_URL runs sslmode=verify-full, so any path
 * where the CA failed to load meant every query on that function failed; an
 * import cannot be absent from the bundle. An env cert still wins if provided
 * (rotation escape hatch).
 */
export function resolveSSL() {
  const envCert =
    process.env.COCKROACH_CA_CERT || process.env.COCKROACH_CERT || process.env.COCKROACHDB_CERT;
  const ca = envCert && envCert.includes("BEGIN CERTIFICATE") ? envCert : COCKROACH_CA_PEM;
  return { ca, rejectUnauthorized: true as const };
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
