import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell, ClientSide, StepsSide } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { getAuthSession } from "@/lib/server-user";
import { continueUrl } from "@/lib/post-auth";
import { openDraft } from "@/app/get-started/draft";
import { getCatalogService } from "@/lib/services/catalog";

export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * Client sign-up (R1.1/R1.6). Staff and client colleagues arrive by
 * invitation instead; the role here is always "client" (server-only field).
 */
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ draft?: string; redirect?: string }> }) {
  const sp = await searchParams;
  const s = await getAuthSession();
  if (s?.user) redirect(continueUrl(sp.redirect, { draft: sp.draft }));

  const draft = sp.draft ? await openDraft(sp.draft).catch(() => null) : null;
  const service = draft?.serviceSlug ? await getCatalogService(draft.serviceSlug).catch(() => null) : null;

  return (
    <AuthShell side={service ? <StepsSide /> : <ClientSide />}>
      <Suspense fallback={null}>
        <SignupForm
          draftId={draft?.id ?? null}
          serviceName={service?.name ?? null}
          googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)}
        />
      </Suspense>
    </AuthShell>
  );
}
