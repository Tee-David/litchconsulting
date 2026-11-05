import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import { getAuthSession } from "@/lib/server-user";
import { continueUrl } from "@/lib/post-auth";

export const metadata: Metadata = {
  title: "Confirm your email",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ verified?: string; redirect?: string }> }) {
  const sp = await searchParams;
  const s = await getAuthSession();
  const u = s?.user as { email?: string; emailVerified?: boolean } | undefined;
  // Verified and signed in (old links that still point here): move on.
  if (u?.emailVerified) redirect(continueUrl(sp.redirect));
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <VerifyEmailForm knownEmail={u?.email ?? null} />
      </Suspense>
    </AuthShell>
  );
}
