import "server-only";
import { getSessionUser } from "@/lib/server-user";
import { homeFor, roleOf } from "@/lib/access";
import { onboardingFor } from "@/lib/onboarding";
import { OnboardingChecklist } from "./onboarding-checklist";

/**
 * Drop-in for any home page (admin /admin, staff /work, client /dashboard):
 *
 *   import { Onboarding } from "@/components/access/onboarding";
 *   <Onboarding />
 *
 * Renders the signed-in person's getting-started checklist until it is done
 * or hidden, and nothing otherwise. Never throws.
 */
export async function Onboarding() {
  const me = await getSessionUser();
  if (!me) return null;
  const role = roleOf(me);
  const state = await onboardingFor({ id: me.id, email: me.email, name: me.name, role, twoFactorEnabled: Boolean((me as { twoFactorEnabled?: boolean }).twoFactorEnabled) });
  if (!state || !state.visible) return null;
  return <OnboardingChecklist state={state} homeHref={homeFor(role)} />;
}
