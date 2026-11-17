import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser, twoStepState } from "@/lib/server-user";
import { homeFor, roleOf } from "@/lib/access";
import { destinationFor, safePath } from "@/lib/post-auth";
import { onboardingFor } from "@/lib/onboarding";
import { getPrefs, CATEGORIES } from "@/lib/notifications";
import { OnboardingChecklist } from "@/components/access/onboarding-checklist";
import { StaffWelcome } from "@/components/access/staff-welcome";
import { ClientWelcome } from "@/components/access/client-welcome";

export const metadata: Metadata = { title: "Welcome", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * First-run onboarding per role (R1.5). Shown once after the first sign-in
 * (/account/continue sends people here) and reachable from the checklist on
 * each home. Nothing here blocks: every step can be skipped.
 */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ next?: string; step?: string }> }) {
  const sp = await searchParams;
  const me = await getSessionUser();
  if (!me) {
    const hold = await twoStepState();
    if (hold === "enrol") redirect("/account/two-step?next=/account/welcome");
    if (hold === "verify") redirect("/account/two-step/verify?next=/account/welcome");
    redirect("/login?redirect=/account/welcome");
  }
  const role = roleOf(me);
  const next = destinationFor(role, safePath(sp.next));
  const twoFactorEnabled = Boolean((me as { twoFactorEnabled?: boolean }).twoFactorEnabled);
  const state = await onboardingFor({ id: me.id, email: me.email, name: me.name, role, twoFactorEnabled });
  const first = (me.name || "").split(" ")[0] || "there";

  if (role === "admin") {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-[1.6rem] font-bold leading-tight tracking-tight text-ink sm:text-[1.75rem]">Set up Litch</h1>
          <p className="mt-1 max-w-[70ch] text-[15px] text-body">
            A few things make the platform ready for clients. Do them in any order; the list stays on your home until it is done. The checks are live, so they tick themselves.
          </p>
        </div>
        {state ? <OnboardingChecklist state={state} homeHref={homeFor(role)} standalone /> : null}
        <a href={next} className="inline-block text-sm font-medium text-accent hover:underline">
          Go to Admin home
        </a>
      </div>
    );
  }

  if (role === "staff") {
    const prefs = await getPrefs(me.id).catch(() => []);
    const { staffRequestRows } = await import("@/lib/requests/work");
    const rows = await staffRequestRows(me.id).catch(() => []);
    return (
      <StaffWelcome
        firstName={first}
        name={me.name}
        email={me.email}
        twoStep={twoFactorEnabled}
        startAt={sp.step === "alerts" ? 1 : 0}
        prefs={prefs.map((p) => ({ ...p, label: CATEGORIES[p.category].label, hint: CATEGORIES[p.category].hint }))}
        assigned={rows.slice(0, 5).map((r) => ({ id: r.id, number: r.number, service: r.serviceName, client: r.client }))}
        next={next}
      />
    );
  }

  const { getClientForUser } = await import("@/lib/db/queries/clients");
  const c = await getClientForUser(me.id, me.email, me.name);
  const tax = c.taxId ?? "";
  const tin = /TIN\s*([^·]+)/i.exec(tax)?.[1]?.trim() ?? (tax && !/RC/i.test(tax) ? tax : "");
  const rc = /RC\s*([^·]+)/i.exec(tax)?.[1]?.trim() ?? "";
  return (
    <ClientWelcome
      firstName={first}
      initial={{ company: c.company ?? "", rcNumber: rc, taxId: tin, address: c.address ?? "" }}
      isOwner={c.userId === me.id}
      next={next}
    />
  );
}
