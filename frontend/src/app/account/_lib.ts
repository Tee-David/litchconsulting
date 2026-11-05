import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";

/**
 * Account reads for /account/* (R1.4). Better Auth owns `session` and
 * `account` (camelCase columns); we read them directly for the device list
 * and sign-in methods, always scoped to the signed-in user's id.
 */

export type DeviceRow = { id: string; current: boolean; device: string; ip: string | null; createdAt: string; updatedAt: string; expiresAt: string };

export function deviceOf(ua?: string | null): { label: string; kind: "phone" | "computer" } {
  if (!ua) return { label: "Unknown device", kind: "computer" };
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  const phone = /iPhone|Android.+Mobile/.test(ua);
  return { label: os ? `${browser} on ${os}` : browser, kind: phone ? "phone" : "computer" };
}

export async function listDevices(userId: string, currentSessionId: string): Promise<DeviceRow[]> {
  const res = await db.execute<{ id: string; userAgent: string | null; ipAddress: string | null; createdAt: Date; updatedAt: Date; expiresAt: Date }>(
    sql`SELECT "id", "userAgent", "ipAddress", "createdAt", "updatedAt", "expiresAt" FROM "session" WHERE "userId" = ${userId} AND "expiresAt" > now() ORDER BY "updatedAt" DESC LIMIT 50`,
  );
  return res.rows.map((r) => ({
    id: r.id,
    current: r.id === currentSessionId,
    device: deviceOf(r.userAgent).label,
    ip: r.ipAddress,
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
    expiresAt: new Date(r.expiresAt).toISOString(),
  }));
}

export async function signInMethods(userId: string): Promise<{ password: boolean; passwordChangedAt: string | null; google: { email: string | null } | null }> {
  const res = await db.execute<{ providerId: string; updatedAt: Date | null }>(sql`SELECT "providerId", "updatedAt" FROM "account" WHERE "userId" = ${userId}`);
  const cred = res.rows.find((r) => r.providerId === "credential");
  const google = res.rows.find((r) => r.providerId === "google");
  return {
    password: Boolean(cred),
    passwordChangedAt: cred?.updatedAt ? new Date(cred.updatedAt).toISOString() : null,
    google: google ? { email: null } : null,
  };
}

export async function hasPassword(userId: string): Promise<boolean> {
  return (await signInMethods(userId)).password;
}

export type SignInEvent = { id: string; ok: boolean; at: string; method: string | null; device: string | null; ip: string | null; reason: string | null };

/** Sign-in history (successful and failed), from the audit log auth.ts writes. */
export async function signInHistory(userId: string, limit = 15): Promise<SignInEvent[]> {
  const rows = await db
    .select({ id: auditLog.id, action: auditLog.action, meta: auditLog.meta, at: auditLog.createdAt })
    .from(auditLog)
    .where(and(eq(auditLog.entity, "user"), eq(auditLog.entityId, userId), inArray(auditLog.action, ["auth.signed_in", "auth.sign_in_failed"])))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
  return rows.map((r) => {
    const m = (r.meta ?? {}) as { method?: string; device?: string; ip?: string; reason?: string };
    return {
      id: r.id,
      ok: r.action === "auth.signed_in",
      at: r.at.toISOString(),
      method: m.method ?? null,
      device: m.device ?? null,
      ip: m.ip ?? null,
      reason: m.reason ?? null,
    };
  });
}
