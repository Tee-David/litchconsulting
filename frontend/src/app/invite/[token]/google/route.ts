import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessionTwoStep } from "@/lib/db/schema";
import { INVITE_COOKIE } from "@/lib/auth";
import { getAuthSession } from "@/lib/server-user";
import { invitationForToken, normaliseEmail, redeemInvitationForUser } from "@/lib/invitations";
import { afterAccepted } from "../accept-lib";

export const dynamic = "force-dynamic";

/**
 * Where "Continue with Google" lands after an invitation (R1.2). The
 * invitation is spent ONLY when the Google account's email is the invited
 * one. Any other account: the invitation stays open, the session that Google
 * just made is ended, and the invite page explains which account to use.
 * (lib/auth.ts already refused to create a new account for a mismatched
 * email, so a mismatch here means an existing account signed in.)
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/invite/${encodeURIComponent(token)}${q}`, req.nextUrl.origin));
    res.cookies.delete(INVITE_COOKIE);
    return res;
  };

  const inv = await invitationForToken(token).catch(() => null);
  if (!inv) return back("");
  const s = await getAuthSession();
  if (!s?.user) return back("?error=google");

  if (normaliseEmail(s.user.email) !== inv.email) {
    // Not the invited person: sign this session out, keep the invitation open.
    await db.execute(sql`DELETE FROM "session" WHERE "id" = ${s.session.id}`);
    await db.delete(sessionTwoStep).where(eq(sessionTwoStep.sessionId, s.session.id));
    const res = back("?error=mismatch");
    for (const name of ["litch.session_token", "__Secure-litch.session_token", "litch.session_data", "__Secure-litch.session_data"]) res.cookies.delete(name);
    return res;
  }

  if (inv.state === "redeemed" && inv.redeemedBy === s.user.id) return NextResponse.redirect(new URL("/account/continue", req.nextUrl.origin));
  if (inv.state !== "pending") return back("");

  const res = await redeemInvitationForUser(token, s.user.id);
  if (!res.ok) return back(`?error=${res.reason}`);
  await afterAccepted(res, "google");
  const done = NextResponse.redirect(new URL("/account/continue", req.nextUrl.origin));
  done.cookies.delete(INVITE_COOKIE);
  return done;
}
