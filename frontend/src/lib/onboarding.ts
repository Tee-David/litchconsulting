import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog, client, invitation, orgSettings, serviceOffering, serviceRequest, user, userOnboarding } from "@/lib/db/schema";
import type { Role } from "@/lib/access";

/**
 * First-run onboarding per role (R1.5). A short checklist that stays on the
 * person's home until it is done or hidden, persisted server-side so it
 * follows them across devices. Admin items are LIVE checks (is SMTP set, is
 * Paystack live, did a backup restore test pass) rather than ticks someone
 * remembers to make; a few steps (alerts, tour) are ticked by the person.
 */

export type OnboardingItem = {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  href: string;
  action: string;
  optional?: boolean;
};

export type OnboardingState = {
  role: Role;
  items: OnboardingItem[];
  done: number;
  total: number;
  /** Hidden for now ("Hide until tomorrow") or finished/dismissed for good. */
  visible: boolean;
  completedAt: string | null;
};

type Row = typeof userOnboarding.$inferSelect;
type Steps = Record<string, string>;
export type TourRecord = Record<string, { version: number; status: "finished" | "skipped"; at: string }>;

export async function getOnboardingRow(userId: string): Promise<Row | null> {
  const [row] = await db.select().from(userOnboarding).where(eq(userOnboarding.userId, userId)).limit(1);
  return row ?? null;
}

async function upsert(userId: string, patch: Partial<Omit<Row, "userId">>) {
  await db
    .insert(userOnboarding)
    .values({ userId, ...patch })
    .onConflictDoUpdate({ target: userOnboarding.userId, set: { ...patch, updatedAt: new Date() } });
}

export async function markStep(userId: string, step: string) {
  const row = await getOnboardingRow(userId);
  const steps = { ...((row?.steps as Steps) ?? {}), [step]: new Date().toISOString() };
  await upsert(userId, { steps });
}

export async function hideOnboarding(userId: string, untilTomorrow: boolean) {
  if (untilTomorrow) {
    await upsert(userId, { hiddenUntil: new Date(Date.now() + 24 * 60 * 60 * 1000) });
  } else {
    await upsert(userId, { completedAt: new Date() });
  }
}

export async function reopenOnboarding(userId: string) {
  await upsert(userId, { completedAt: null, hiddenUntil: null });
}

export async function getTours(userId: string): Promise<TourRecord> {
  const row = await getOnboardingRow(userId);
  return ((row?.tours as TourRecord) ?? {}) as TourRecord;
}

export async function recordTour(userId: string, tourId: string, version: number, status: "finished" | "skipped") {
  const row = await getOnboardingRow(userId);
  const tours = { ...(((row?.tours as TourRecord) ?? {}) as TourRecord), [tourId]: { version, status, at: new Date().toISOString() } };
  await upsert(userId, { tours });
}

/* ------------------------------------------------------------ live checks */

async function adminItems(userId: string, steps: Steps): Promise<OnboardingItem[]> {
  const [org, staffCount, pendingInvites, priced, restore] = await Promise.all([
    db.select().from(orgSettings).where(eq(orgSettings.id, "default")).limit(1).then((r) => r[0] ?? null).catch(() => null),
    db.select({ n: sql<number>`count(*)::int` }).from(user).where(eq(user.role, "staff")).then((r) => r[0]?.n ?? 0).catch(() => 0),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(invitation)
      .where(and(eq(invitation.role, "staff"), isNull(invitation.redeemedAt), isNull(invitation.revokedAt)))
      .then((r) => r[0]?.n ?? 0)
      .catch(() => 0),
    db.select({ n: sql<number>`count(*)::int` }).from(serviceOffering).where(eq(serviceOffering.active, true)).then((r) => r[0]?.n ?? 0).catch(() => 0),
    db.select({ meta: auditLog.meta, at: auditLog.createdAt }).from(auditLog).where(eq(auditLog.action, "backup.restore_test")).orderBy(desc(auditLog.createdAt)).limit(1).then((r) => r[0] ?? null).catch(() => null),
  ]);
  const { emailConfigured } = await import("@/lib/email");
  const { paystackConfigured, paystackMode } = await import("@/lib/paystack");
  const payReady = paystackConfigured();
  const live = payReady && paystackMode() === "live";
  const restorePassed = Boolean((restore?.meta as { pass?: boolean } | null)?.pass);
  void userId;
  return [
    {
      id: "firm",
      title: "Firm details and bank account",
      detail: org?.companyName && org?.accountNumber ? `${org.companyName} · bank details on invoices` : "Company name, logo and the bank account clients pay into.",
      done: Boolean(org?.companyName && org?.accountNumber),
      href: "/admin/settings",
      action: "Add details",
    },
    {
      id: "email",
      title: "Email sending",
      detail: emailConfigured ? "SMTP is configured. Check delivery in Integrations." : "SMTP is not set, so no email leaves the platform.",
      done: emailConfigured,
      href: "/admin/settings/integrations",
      action: "Check email",
    },
    {
      id: "services",
      title: "Service catalogue and prices",
      detail: priced ? `${priced} services are live for clients.` : "No services are switched on yet.",
      done: priced > 0 && Boolean(steps.services),
      href: "/admin/services",
      action: "Review services",
    },
    {
      id: "payments",
      title: "Payments: Paystack",
      detail: !payReady ? "Paystack keys are not set." : live ? "Live mode. Clients can pay by card." : "Test mode works. Switch to live when ready.",
      done: live,
      href: "/admin/settings/integrations",
      action: payReady ? "Go live" : "Connect",
    },
    {
      id: "team",
      title: "Invite your team",
      detail: staffCount ? `${staffCount} staff${pendingInvites ? ` · ${pendingInvites} invitation${pendingInvites === 1 ? "" : "s"} pending` : ""}` : pendingInvites ? `${pendingInvites} invitation${pendingInvites === 1 ? "" : "s"} pending` : "Staff see only the requests you assign.",
      done: staffCount > 0 || Boolean(steps.team),
      href: "/admin/settings/access?invite=1",
      action: "Invite",
      optional: true,
    },
    {
      id: "backups",
      title: "Backups and a restore test",
      detail: restorePassed ? "Nightly backups, and a restore test has passed." : "Nightly at 03:30. Run a restore test to prove a backup works.",
      done: restorePassed,
      href: "/admin/settings/backups",
      action: "Run restore test",
    },
  ];
}

async function staffItems(userId: string, steps: Steps, twoStep: boolean): Promise<OnboardingItem[]> {
  const [u] = await db.select({ name: user.name, image: user.image }).from(user).where(eq(user.id, userId)).limit(1);
  return [
    {
      id: "profile",
      title: "Your profile",
      detail: "Your name and photo as clients and colleagues see them.",
      done: Boolean(steps.profile) || Boolean(u?.image),
      href: "/account/welcome?step=profile",
      action: "Check profile",
    },
    {
      id: "alerts",
      title: "How you hear from us",
      detail: "Email, push and the bell, per kind of event.",
      done: Boolean(steps.alerts),
      href: "/account/welcome?step=alerts",
      action: "Set alerts",
    },
    {
      id: "twostep",
      title: "Two-step sign-in",
      detail: twoStep ? "On. Keep your backup codes somewhere safe." : "Required for staff.",
      done: twoStep,
      href: "/account/security#two-step",
      action: "Set up",
    },
    {
      id: "tour",
      title: "A two-minute tour of your work",
      detail: "Where assignments, client messages and files live.",
      done: Boolean(steps.tour),
      href: "/work?tour=1",
      action: "Start tour",
      optional: true,
    },
  ];
}

async function clientItems(userId: string, email: string, name: string, steps: Steps): Promise<OnboardingItem[]> {
  const { getClientForUser } = await import("@/lib/db/queries/clients");
  const c = await getClientForUser(userId, email, name);
  const [reqs] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(serviceRequest)
    .where(and(eq(serviceRequest.clientId, c.id), isNull(serviceRequest.deletedAt)));
  const [colleagues] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(invitation)
    .where(eq(invitation.clientId, c.id));
  return [
    {
      id: "company",
      title: "Company details for your invoices",
      detail: c.taxId && c.address ? `${c.company || c.name} · TIN on file` : "RC number, TIN and billing address, so your accounts team can file our invoices.",
      done: Boolean(c.taxId && c.address),
      href: "/account/welcome?step=company",
      action: "Add details",
    },
    {
      id: "colleague",
      title: "Invite a colleague",
      detail: "Add the person who pays or approves, if that is not you.",
      done: (colleagues?.n ?? 0) > 0 || Boolean(steps.colleague),
      href: "/account/welcome?step=company",
      action: "Invite",
      optional: true,
    },
    {
      id: "request",
      title: "Your first request",
      detail: "Choose a service and tell us about the work.",
      done: (reqs?.n ?? 0) > 0,
      href: "/dashboard/requests/new",
      action: "Start a request",
    },
  ];
}

/** Clients whose company row this user is the owner of (for the client welcome form). */
export async function ownedClient(userId: string) {
  const [c] = await db.select().from(client).where(eq(client.userId, userId)).limit(1);
  return c ?? null;
}

/**
 * The checklist for this person. Never throws: onboarding is a courtesy, and
 * a failed live check must not take a home page down.
 */
export async function onboardingFor(u: { id: string; email: string; name: string; role: Role; twoFactorEnabled?: boolean }): Promise<OnboardingState | null> {
  try {
    const row = await getOnboardingRow(u.id);
    const steps = ((row?.steps as Steps) ?? {}) as Steps;
    const items =
      u.role === "admin"
        ? await adminItems(u.id, steps)
        : u.role === "staff"
          ? await staffItems(u.id, steps, Boolean(u.twoFactorEnabled))
          : await clientItems(u.id, u.email, u.name, steps);
    const required = items.filter((i) => !i.optional);
    const allDone = required.every((i) => i.done);
    const hidden = Boolean(row?.completedAt) || (row?.hiddenUntil ? row.hiddenUntil.getTime() > Date.now() : false);
    return {
      role: u.role,
      items,
      done: items.filter((i) => i.done).length,
      total: items.length,
      visible: !hidden && !allDone,
      completedAt: row?.completedAt ? row.completedAt.toISOString() : null,
    };
  } catch (err) {
    console.error("[onboarding] failed:", err);
    return null;
  }
}

/** Is this the person's first visit (no onboarding row yet)? Used to route first sign-ins to the welcome. */
export async function isFirstRun(userId: string): Promise<boolean> {
  try {
    return !(await getOnboardingRow(userId));
  } catch {
    return false;
  }
}
