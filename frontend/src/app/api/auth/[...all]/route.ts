import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { rateLimit, RATE_LIMITS, callerKey, callerIp, tooManyRequests } from "@/lib/rate-limit";
import { TURNSTILE_HEADER, verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";

const handler = toNextJsHandler(auth);

/**
 * Credential endpoints get a shared (DB-backed) per-IP budget on top of Better
 * Auth's own checks: sign-in, sign-up and password-reset requests are the
 * brute-force and mail-bombing surfaces. Everything else passes straight through.
 */
const LIMITED: Array<[RegExp, keyof typeof RATE_LIMITS]> = [
  [/\/sign-in\//, "authSignIn"],
  [/\/sign-up\//, "authSignUp"],
  [/\/(forget-password|request-password-reset|send-verification-email)/, "authReset"],
];

/**
 * Email + password sign-in and sign-up also need a passed Turnstile check, and
 * fail CLOSED: if Cloudflare cannot be reached, the request is refused, never
 * let through. (Google sign-in is checked by Google; contact and newsletter
 * fail open.) The forms send the widget token in the `x-turnstile-token` header.
 */
const HUMAN_CHECK = /\/(sign-in|sign-up)\/email$/;

export const GET = handler.GET;

export async function POST(req: Request) {
  const path = new URL(req.url).pathname;
  const match = LIMITED.find(([re]) => re.test(path));
  if (match) {
    const limited = await rateLimit(callerKey(req.headers, match[1]), RATE_LIMITS[match[1]]);
    if (!limited.ok) return tooManyRequests(limited);
  }
  if (HUMAN_CHECK.test(path)) {
    const human = await verifyTurnstile(req.headers.get(TURNSTILE_HEADER), callerIp(req.headers), "closed");
    if (!human.ok) {
      return Response.json(
        { code: human.unavailable ? "SECURITY_CHECK_UNAVAILABLE" : "SECURITY_CHECK_FAILED", message: human.error },
        { status: 403 },
      );
    }
  }
  return handler.POST(req);
}
