import type { Role } from "@/lib/access";
import { homeFor } from "@/lib/access";

/**
 * Where a person goes after signing in (R1.1). A requested page (`?redirect=`)
 * is only followed when it is a same-site path AND this role may open it;
 * otherwise each role lands on its own home. Isomorphic: the login form uses
 * it to build the continue URL, /account/continue decides with it.
 */

/** Same-site relative path, or null (blocks //evil.com, /\evil, javascript:). */
export function safePath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (raw.length > 500) return null;
  return raw;
}

/** May this role open this path? Unknown/public paths are allowed for everyone. */
export function pathAllowed(role: Role, path: string): boolean {
  const p = path.split(/[?#]/)[0];
  const under = (prefix: string) => p === prefix || p.startsWith(prefix + "/");
  if (under("/admin")) return role === "admin";
  if (under("/work")) return role === "staff" || role === "admin";
  if (under("/dashboard")) return role === "client";
  // Never "continue" back into the auth pages themselves.
  if (["/login", "/signup", "/verify-email", "/forgot-password", "/reset-password"].some(under)) return false;
  return true;
}

export function destinationFor(role: Role, redirect: string | null | undefined): string {
  const p = safePath(redirect);
  return p && pathAllowed(role, p) ? p : homeFor(role);
}

/** The URL every sign-in path (password, code, Google, email link) finishes at. */
export function continueUrl(redirect?: string | null, extra?: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams();
  const p = safePath(redirect);
  if (p) q.set("redirect", p);
  for (const [k, v] of Object.entries(extra ?? {})) if (v) q.set(k, v);
  const s = q.toString();
  return `/account/continue${s ? `?${s}` : ""}`;
}
