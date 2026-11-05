import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccountUser, twoStepState } from "@/lib/server-user";
import { roleOf } from "@/lib/access";
import { twoStepRequired } from "@/lib/two-step";
import { safePath, continueUrl } from "@/lib/post-auth";
import { hasPassword } from "../_lib";
import { TwoStepEnrol } from "@/components/auth/two-step-enrol";

export const metadata: Metadata = { title: "Set up two-step sign-in", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Two-step enrolment (R1.4). Required for admin and staff: their workspace
 * stays closed (server-side hold) until this is done. Optional for clients,
 * who reach it from Profile and security.
 */
export default async function TwoStepPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const u = await getAccountUser();
  if (!u) redirect("/login");
  const sp = await searchParams;
  const next = safePath(sp.next);
  const role = roleOf(u);
  const state = await twoStepState();
  if (state === "verify") redirect(`/account/two-step/verify${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  if (u.twoFactorEnabled) redirect("/account/security#two-step");

  return (
    <TwoStepEnrol
      required={twoStepRequired(role)}
      needsPassword={await hasPassword(u.id)}
      email={u.email}
      done={next ? continueUrl(next) : twoStepRequired(role) ? continueUrl(null) : "/account/security#two-step"}
    />
  );
}
