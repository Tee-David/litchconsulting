import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccountUser, twoStepState } from "@/lib/server-user";
import { roleOf, ROLE_LABEL } from "@/lib/access";
import { twoStepRequired } from "@/lib/two-step";
import { onboardingFor } from "@/lib/onboarding";
import { listDevices, signInHistory, signInMethods } from "../_lib";
import { SecurityPage } from "@/components/access/security-page";

export const metadata: Metadata = { title: "Profile and security", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Profile and security (R1.4) for every role: devices signed in (sign one out,
 * or everywhere else), password, two-step sign-in, recent sign-ins (including
 * failed attempts), and where alerts are set.
 */
export default async function AccountSecurityPage() {
  const u = await getAccountUser();
  if (!u) redirect("/login?redirect=/account/security");
  const hold = await twoStepState();
  if (hold === "enrol") redirect("/account/two-step");
  if (hold === "verify") redirect("/account/two-step/verify");
  const role = roleOf(u);

  const [devices, history, methods, onboarding] = await Promise.all([
    listDevices(u.id, u.sessionId).catch(() => []),
    signInHistory(u.id).catch(() => []),
    signInMethods(u.id).catch(() => ({ password: true, passwordChangedAt: null, google: null })),
    onboardingFor({ id: u.id, email: u.email, name: u.name, role, twoFactorEnabled: u.twoFactorEnabled }),
  ]);

  const alertsHref = role === "client" ? "/dashboard/notifications?tab=prefs" : role === "staff" ? "/work/notifications?tab=prefs" : "/admin/notifications#prefs";

  return (
    <SecurityPage
      me={{ name: u.name, email: u.email, image: u.image ?? null, roleLabel: ROLE_LABEL[role] }}
      devices={devices}
      history={history}
      methods={methods}
      twoStep={{ enabled: u.twoFactorEnabled, required: twoStepRequired(role) }}
      alertsHref={alertsHref}
      onboardingClosed={Boolean(onboarding && !onboarding.visible && onboarding.done < onboarding.total)}
      now={Date.now()}
    />
  );
}
