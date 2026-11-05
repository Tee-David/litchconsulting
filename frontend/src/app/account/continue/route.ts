import { NextResponse, type NextRequest } from "next/server";
import { getAuthSession, twoStepState } from "@/lib/server-user";
import { roleOf } from "@/lib/access";
import { destinationFor, safePath } from "@/lib/post-auth";

export const dynamic = "force-dynamic";

/**
 * The one place every sign-in finishes (password, password + code, Google,
 * the email-verification link, an accepted invitation). It decides, on the
 * server:
 *   1. not signed in            → /login (keeping the requested page)
 *   2. firm account, two-step   → enrol or enter the code first
 *   3. a draft from /get-started → claim it, then open the request flow
 *   4. first visit              → the short per-role welcome
 *   5. otherwise                → the requested page if this role may open
 *                                 it, else the role's own home
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const redirect = safePath(url.searchParams.get("redirect"));
  const draft = url.searchParams.get("draft");
  const error = url.searchParams.get("error");
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin));

  // Better Auth appends ?error= to the callback when a verification link is bad.
  if (error) {
    const known = /token|expired|invalid/i.test(error) ? "link" : error;
    return to(`/verify-email?error=${encodeURIComponent(known)}`);
  }

  const s = await getAuthSession();
  if (!s?.user) {
    const q = new URLSearchParams();
    if (redirect) q.set("redirect", redirect);
    return to(`/login${q.size ? `?${q}` : ""}`);
  }
  const u = s.user as unknown as { id: string; email: string; name: string; role?: string; banned?: boolean };
  if (u.banned) return to("/login?banned=1");

  const next = redirect ? `?next=${encodeURIComponent(redirect)}` : "";
  const hold = await twoStepState();
  if (hold === "enrol") return to(`/account/two-step${next}`);
  if (hold === "verify") return to(`/account/two-step/verify${next}`);

  const role = roleOf(u);

  if (draft && role === "client") {
    try {
      const { claimDraft } = await import("@/app/get-started/draft");
      const row = await claimDraft(draft, { id: u.id, email: u.email, name: u.name });
      if (row?.serviceSlug) return to(`/get-started/resume?draft=${row.id}`);
    } catch (err) {
      console.error("[continue] draft claim failed:", err);
    }
  }

  try {
    const { isFirstRun } = await import("@/lib/onboarding");
    if (await isFirstRun(u.id)) {
      const { markStep } = await import("@/lib/onboarding");
      await markStep(u.id, "welcomed"); // creates the row: the welcome shows once
      return to(`/account/welcome${redirect ? `?next=${encodeURIComponent(redirect)}` : ""}`);
    }
  } catch {
    /* onboarding is a courtesy; never block sign-in on it */
  }

  return to(destinationFor(role, redirect));
}
