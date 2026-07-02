import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Guards the authenticated app. Better Auth sets an httpOnly session cookie
 * (prefix "litch"); we do a fast cookie-presence check at the edge and redirect
 * unauthenticated users to /login with a return path. Full session validation
 * and role checks (admin) still happen server-side in the layouts/pages.
 */
const PROTECTED = ["/dashboard", "/admin"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const needsAuth = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!needsAuth) return NextResponse.next();

  const session = getSessionCookie(request, { cookiePrefix: "litch" });
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
