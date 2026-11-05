"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import { rateLimit, callerKey } from "@/lib/rate-limit";
import { invitationForToken, redeemInvitation, type RedeemFailure } from "@/lib/invitations";
import { REASON, afterAccepted } from "./accept-lib";
import { INVITE_COOKIE } from "@/lib/auth";

/*
 * Accept an invitation (R1.2). The token is the only credential: it names one
 * invitation, the account is created verified for exactly that email, and the
 * role comes from the invitation row, never from the form.
 */


const schema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(2, "Enter your full name.").max(120),
  password: z.string().min(1, "Choose a password.").max(128),
});

export type AcceptResult = { ok: true; email: string; withPassword: boolean } | { ok: false; error: string; reason?: RedeemFailure };

export async function acceptInvitationAction(input: z.infer<typeof schema>): Promise<AcceptResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const limited = await rateLimit(callerKey(await headers(), "invite-accept"), { limit: 15, windowSeconds: 3600 });
  if (!limited.ok) return { ok: false, error: "Too many tries from this connection. Wait a little and try again." };

  const res = await redeemInvitation(parsed.data.token, { name: parsed.data.name, password: parsed.data.password });
  if (!res.ok) return { ok: false, error: REASON[res.reason], reason: res.reason };

  await afterAccepted(res, "password");
  return { ok: true, email: res.email, withPassword: true };
}

/**
 * "Continue with Google" step 1: check the invitation is still open and name
 * it in a short httpOnly cookie. Nothing is created or spent here; the Google
 * callback lands on /invite/[token]/google, which only accepts the invitation
 * when the Google email is the invited one (lib/auth.ts refuses to create any
 * other account while this cookie is set).
 */
export async function prepareInviteGoogleAction(token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return { ok: false, error: REASON.invalid };
  const inv = await invitationForToken(token).catch(() => null);
  if (!inv) return { ok: false, error: REASON.invalid };
  if (inv.state !== "pending") return { ok: false, error: REASON[inv.state] };
  (await cookies()).set(INVITE_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 15 * 60 });
  return { ok: true };
}
