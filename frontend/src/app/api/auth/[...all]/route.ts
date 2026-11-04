import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { rateLimit, RATE_LIMITS, callerKey, tooManyRequests } from "@/lib/rate-limit";

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

export const GET = handler.GET;

export async function POST(req: Request) {
  const path = new URL(req.url).pathname;
  const match = LIMITED.find(([re]) => re.test(path));
  if (match) {
    const limited = await rateLimit(callerKey(req.headers, match[1]), RATE_LIMITS[match[1]]);
    if (!limited.ok) return tooManyRequests(limited);
  }
  return handler.POST(req);
}
