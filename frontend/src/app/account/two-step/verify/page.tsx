import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccountUser, twoStepState } from "@/lib/server-user";
import { safePath, continueUrl } from "@/lib/post-auth";
import { TwoStepVerify } from "@/components/auth/two-step-verify";

export const metadata: Metadata = { title: "Enter your code", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * The second factor for a session that signed in without it (Google, or a
 * session from before two-step was required). Server-held until it passes.
 */
export default async function TwoStepVerifyPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const u = await getAccountUser();
  if (!u) redirect("/login");
  const sp = await searchParams;
  const next = safePath(sp.next);
  const state = await twoStepState();
  if (state === "enrol") redirect(`/account/two-step${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  if (state === "ok") redirect(continueUrl(next));
  return <TwoStepVerify done={continueUrl(next)} />;
}
