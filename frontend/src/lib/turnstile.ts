import "server-only";

/**
 * Cloudflare Turnstile server-side verification.
 *
 * Keys: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (widget) + `TURNSTILE_SECRET_KEY`
 * (here). With no secret configured (local dev without keys) verification is
 * skipped, so forms keep working; in production both are set.
 *
 * Two policies when Cloudflare itself cannot be reached:
 * - `"closed"` (sign-in, sign-up): refuse. A credential endpoint must never run
 *   without the check; the person waits a minute and tries again.
 * - `"open"` (contact, newsletter): allow. The honeypot and the rate limit still
 *   apply, and a real client must not lose the contact form to an outage.
 * A missing or rejected token is refused under both policies.
 */
export type TurnstileResult = { ok: true; skipped?: boolean } | { ok: false; error: string; unavailable?: boolean };
export type TurnstilePolicy = "open" | "closed";

export const turnstileEnabled = Boolean(process.env.TURNSTILE_SECRET_KEY);

/** The header the auth forms send their widget token in. */
export const TURNSTILE_HEADER = "x-turnstile-token";

export async function verifyTurnstile(token: unknown, ip?: string, policy: TurnstilePolicy = "open"): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };
  if (typeof token !== "string" || token.length < 10 || token.length > 4096) {
    return { ok: false, error: "Please complete the security check and try again." };
  }
  let data: { success?: boolean; "error-codes"?: string[] };
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`siteverify answered ${res.status}`);
    data = (await res.json()) as typeof data;
  } catch (err) {
    if (policy === "closed") {
      console.error("[turnstile] verify unavailable, refusing (fail closed):", err);
      return { ok: false, unavailable: true, error: "The security check could not run just now. Wait a minute, then try again." };
    }
    console.error("[turnstile] verify unavailable, allowing (fail open):", err);
    return { ok: true, skipped: true };
  }
  if (data.success) return { ok: true };
  console.warn("[turnstile] rejected:", data["error-codes"]);
  return { ok: false, error: "The security check failed. Please refresh and try again." };
}

/** Pull the widget token out of a parsed JSON body without trusting its shape. */
export function turnstileTokenFrom(body: unknown): unknown {
  return body && typeof body === "object" ? (body as Record<string, unknown>).turnstileToken : undefined;
}
