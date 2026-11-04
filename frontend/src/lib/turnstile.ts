import "server-only";

/**
 * Cloudflare Turnstile server-side verification for the public forms.
 *
 * Keys: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (widget) + `TURNSTILE_SECRET_KEY`
 * (here). With no secret configured (local dev without keys) verification is
 * skipped, so forms keep working; in production both are set.
 */
export type TurnstileResult = { ok: true; skipped?: boolean } | { ok: false; error: string };

export const turnstileEnabled = Boolean(process.env.TURNSTILE_SECRET_KEY);

export async function verifyTurnstile(token: unknown, ip?: string): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };
  if (typeof token !== "string" || token.length < 10 || token.length > 4096) {
    return { ok: false, error: "Please complete the security check and try again." };
  }
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (data.success) return { ok: true };
    console.warn("[turnstile] rejected:", data["error-codes"]);
    return { ok: false, error: "The security check failed. Please refresh and try again." };
  } catch (err) {
    // Cloudflare unreachable: fail open (the rate limit still applies) rather
    // than lock every real client out of the contact form.
    console.error("[turnstile] verify unavailable, allowing:", err);
    return { ok: true, skipped: true };
  }
}

/** Pull the widget token out of a parsed JSON body without trusting its shape. */
export function turnstileTokenFrom(body: unknown): unknown {
  return body && typeof body === "object" ? (body as Record<string, unknown>).turnstileToken : undefined;
}
