import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { getAuthSession } from "@/lib/server-user";
import { continueUrl } from "@/lib/post-auth";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/** One sign-in for all three roles; /account/continue sends each to its own door. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ redirect?: string; banned?: string; error?: string }> }) {
  const sp = await searchParams;
  // Already signed in (and not suspended): skip the form.
  const s = await getAuthSession();
  if (s?.user && !sp.banned && !(s.user as { banned?: boolean }).banned) redirect(continueUrl(sp.redirect));

  return (
    <AuthShell>
      <Suspense fallback={null}>
        <LoginForm googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)} />
      </Suspense>
    </AuthShell>
  );
}
