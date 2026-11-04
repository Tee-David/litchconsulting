import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

/**
 * Rate limiting for public and abuse-prone endpoints.
 *
 * Shared state: counts live in CockroachDB (`rate_limit`), so every Vercel
 * instance sees the same allowance — an in-memory Map per instance is only a
 * speed bump, because each cold start hands an attacker a fresh budget.
 * One atomic UPSERT per hit (fixed window keyed by `floor(now / window)`).
 *
 * Fail-open, but not to nothing: if the DB is unreachable we fall back to a
 * per-instance sliding window (ported from WDC `rate-limit.ts`), so a DB blip
 * never blocks a real client and never fully removes the limit.
 * Expired rows are deleted by `/api/cron/sweep` (`sweepRateLimits`).
 */

export type RateLimitResult = { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number };

export type RateLimitRule = { limit: number; windowSeconds: number };

/** Per-route budgets. Keys also carry the caller, so routes never share allowance. */
export const RATE_LIMITS = {
  contact: { limit: 5, windowSeconds: 600 },
  newsletter: { limit: 5, windowSeconds: 600 },
  payInit: { limit: 10, windowSeconds: 600 },
  uploadPresign: { limit: 60, windowSeconds: 600 },
  upload: { limit: 30, windowSeconds: 600 },
  authSignIn: { limit: 10, windowSeconds: 600 },
  authSignUp: { limit: 5, windowSeconds: 3600 },
  authReset: { limit: 5, windowSeconds: 3600 },
} satisfies Record<string, RateLimitRule>;

// ---------------------------------------------------------------- fallback
const memory = new Map<string, number[]>();
let sinceSweep = 0;

function memoryLimit(key: string, { limit, windowSeconds }: RateLimitRule): RateLimitResult {
  const windowMs = windowSeconds * 1000;
  const now = Date.now();
  if (++sinceSweep >= 500) {
    sinceSweep = 0;
    for (const [k, times] of memory) if (!times.some((t) => now - t < windowMs)) memory.delete(k);
  }
  const recent = (memory.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  memory.set(key, recent);
  if (recent.length <= limit) return { ok: true, remaining: limit - recent.length };
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000)) };
}

// ---------------------------------------------------------------- shared
/** Record one attempt for `key` and say whether it is within `rule`. */
export async function rateLimit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(nowSec / rule.windowSeconds) * rule.windowSeconds;
  const resetAt = windowStart + rule.windowSeconds;
  try {
    const res = await db.execute<{ count: number }>(sql`
      INSERT INTO "rate_limit" ("key", "window_start", "count", "expires_at")
      VALUES (${key}, ${windowStart}, 1, to_timestamp(${resetAt}))
      ON CONFLICT ("key", "window_start") DO UPDATE SET "count" = "rate_limit"."count" + 1
      RETURNING "count"`);
    const count = Number(res.rows[0]?.count ?? 1);
    if (count <= rule.limit) return { ok: true, remaining: rule.limit - count };
    return { ok: false, retryAfterSeconds: Math.max(1, resetAt - nowSec) };
  } catch (err) {
    console.error("[rate-limit] shared store unavailable, using per-instance fallback:", err);
    return memoryLimit(key, rule);
  }
}

/**
 * The caller's IP. On Vercel the platform overwrites `x-forwarded-for`, so the
 * first entry is the real peer. A missing header shares one "unknown" bucket on
 * purpose — callers without it must not each get their own allowance.
 */
export function callerIp(headers: Headers): string {
  return (
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/** `scope:ip` — the usual key for an unauthenticated route. */
export function callerKey(headers: Headers, scope: string): string {
  return `${scope}:${callerIp(headers)}`;
}

/** Standard 429 response for route handlers. */
export function tooManyRequests(result: Extract<RateLimitResult, { ok: false }>): Response {
  return Response.json(
    { ok: false, error: "Too many requests. Please wait a moment and try again." },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
  );
}

/** Delete expired windows. Called from the daily sweep cron. */
export async function sweepRateLimits(): Promise<number> {
  const res = await db.execute(sql`DELETE FROM "rate_limit" WHERE "expires_at" < now()`);
  return res.rowCount ?? 0;
}
