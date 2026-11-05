"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { client, sessionTwoStep } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { getAccountUser, getSessionUser } from "@/lib/server-user";
import { roleOf } from "@/lib/access";
import { hideOnboarding, markStep, recordTour, reopenOnboarding } from "@/lib/onboarding";
import { setPref, type NotifyCategory, CATEGORIES } from "@/lib/notifications";

/*
 * Self-service account actions (R1.4, R1.5). Every action is scoped to the
 * signed-in person by the session — there is no user id to tamper with.
 * Session revocation works even while a firm account is held at two-step
 * (getAccountUser), so a person can always sign a lost device out.
 */

type Res = { ok: true; message?: string } | { ok: false; error: string };

async function security(what: string, userId: string, email: string, name: string) {
  const ua = (await headers()).get("user-agent");
  void userId;
  after(async () => {
    try {
      const { sendTemplate } = await import("@/lib/email-templates");
      const { deviceOf } = await import("./_lib");
      await sendTemplate("securityNotice", { name, what, when: new Date(), device: deviceOf(ua).label }, { to: email });
    } catch (err) {
      console.error("[account] security email failed:", err);
    }
  });
}

/** Sign one other device out. */
export async function revokeDeviceAction(sessionId: string): Promise<Res> {
  const me = await getAccountUser();
  if (!me) return { ok: false, error: "Sign in again to manage your devices." };
  if (typeof sessionId !== "string" || !sessionId) return { ok: false, error: "Unknown device." };
  if (sessionId === me.sessionId) return { ok: false, error: "Use Sign out to end this device's session." };
  const res = await db.execute(sql`DELETE FROM "session" WHERE "id" = ${sessionId} AND "userId" = ${me.id}`);
  await db.delete(sessionTwoStep).where(and(eq(sessionTwoStep.sessionId, sessionId), eq(sessionTwoStep.userId, me.id)));
  if (!res.rowCount) return { ok: false, error: "That device was already signed out." };
  await recordAudit({ action: "auth.session_revoked", entity: "user", entityId: me.id, actorId: me.id, actorName: me.name || me.email });
  revalidatePath("/account/security");
  return { ok: true, message: "Signed out of that device." };
}

/** Sign out everywhere except here. */
export async function revokeOtherDevicesAction(): Promise<Res> {
  const me = await getAccountUser();
  if (!me) return { ok: false, error: "Sign in again to manage your devices." };
  const res = await db.execute(sql`DELETE FROM "session" WHERE "userId" = ${me.id} AND "id" <> ${me.sessionId}`);
  await db.delete(sessionTwoStep).where(and(eq(sessionTwoStep.userId, me.id), ne(sessionTwoStep.sessionId, me.sessionId)));
  const n = res.rowCount ?? 0;
  await recordAudit({ action: "auth.sessions_revoked", entity: "user", entityId: me.id, actorId: me.id, actorName: me.name || me.email, meta: { count: n } });
  if (n > 0) await security("You signed out your other devices", me.id, me.email, me.name);
  revalidatePath("/account/security");
  return { ok: true, message: n ? `Signed out on ${n} other ${n === 1 ? "device" : "devices"}. You stay signed in here.` : "No other devices were signed in." };
}

const nameSchema = z.string().trim().min(2, "Enter your full name.").max(120, "That name is too long.");

export async function updateNameAction(name: string): Promise<Res> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "Sign in again to change your profile." };
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter your name." };
  try {
    await auth.api.updateUser({ body: { name: parsed.data }, headers: await headers() });
  } catch {
    return { ok: false, error: "Your name was not saved. Try again." };
  }
  revalidatePath("/account", "layout");
  return { ok: true, message: "Name saved." };
}

/** Google-only accounts: add a password so email sign-in works too. */
export async function setPasswordAction(newPassword: string): Promise<Res> {
  const me = await getAccountUser();
  if (!me) return { ok: false, error: "Sign in again to set a password." };
  const { passwordProblem, passwordBreached } = await import("@/lib/invitations");
  const problem = passwordProblem(newPassword);
  if (problem) return { ok: false, error: problem };
  if (await passwordBreached(newPassword)) return { ok: false, error: "That password has appeared in a known data breach. Choose a different one." };
  try {
    await auth.api.setPassword({ body: { newPassword }, headers: await headers() });
  } catch (err) {
    return { ok: false, error: err instanceof Error && err.message.length < 140 ? err.message : "Your password was not set. Try again." };
  }
  await recordAudit({ action: "auth.password_set", entity: "user", entityId: me.id, actorId: me.id, actorName: me.name || me.email });
  await security("A password was added to your account", me.id, me.email, me.name);
  revalidatePath("/account/security");
  return { ok: true, message: "Password set. You can now sign in with email and password too." };
}

/** Audit + security email after a password change made in the browser (authClient.changePassword). */
export async function passwordChangedAction(): Promise<Res> {
  const me = await getAccountUser();
  if (!me) return { ok: false, error: "Not signed in." };
  await recordAudit({ action: "auth.password_changed", entity: "user", entityId: me.id, actorId: me.id, actorName: me.name || me.email });
  await security("Your password was changed", me.id, me.email, me.name);
  revalidatePath("/account/security");
  return { ok: true };
}

/** Audit + email after two-step changes made in the browser (enable, disable, new backup codes). */
export async function twoStepChangedAction(kind: "enabled" | "disabled" | "codes"): Promise<Res> {
  const me = await getAccountUser();
  if (!me) return { ok: false, error: "Not signed in." };
  if (!["enabled", "disabled", "codes"].includes(kind)) return { ok: false, error: "Unknown change." };
  await recordAudit({ action: `auth.two_step_${kind}`, entity: "user", entityId: me.id, actorId: me.id, actorName: me.name || me.email });
  const what = kind === "enabled" ? "Two-step sign-in was turned on" : kind === "disabled" ? "Two-step sign-in was turned off" : "New backup codes were made";
  await security(what, me.id, me.email, me.name);
  revalidatePath("/account/security");
  return { ok: true };
}

/* ───────────────────────────── onboarding + tours ───────────────────────────── */

const STEP_IDS = ["welcomed", "profile", "alerts", "tour", "services", "team", "colleague", "company"] as const;

export async function markOnboardingStepAction(step: string): Promise<Res> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "Not signed in." };
  if (!(STEP_IDS as readonly string[]).includes(step)) return { ok: false, error: "Unknown step." };
  await markStep(me.id, step);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function hideOnboardingAction(mode: "tomorrow" | "done" | "reopen"): Promise<Res> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "Not signed in." };
  if (mode === "reopen") await reopenOnboarding(me.id);
  else await hideOnboarding(me.id, mode === "tomorrow");
  revalidatePath("/", "layout");
  return { ok: true, message: mode === "tomorrow" ? "Hidden until tomorrow." : mode === "done" ? "Checklist closed. Reopen it from Profile and security." : "Checklist is back on your home." };
}

/** Tour completion is stored per user and tour version (survives new devices). */
export async function recordTourAction(tourId: string, version: number, status: "finished" | "skipped"): Promise<Res> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "Not signed in." };
  if (!/^[a-z0-9-]{2,60}$/.test(tourId) || !Number.isInteger(version) || version < 1 || version > 1000) return { ok: false, error: "Unknown tour." };
  if (status !== "finished" && status !== "skipped") return { ok: false, error: "Unknown status." };
  await recordTour(me.id, tourId, version, status);
  if (tourId.endsWith("-home") || tourId.endsWith("-welcome")) await markStep(me.id, "tour");
  return { ok: true };
}

export async function tourStateAction(): Promise<Record<string, { version: number; status: string }>> {
  const me = await getSessionUser();
  if (!me) return {};
  const { getTours } = await import("@/lib/onboarding");
  return getTours(me.id).catch(() => ({}));
}

const prefsSchema = z.array(
  z.object({
    category: z.enum(Object.keys(CATEGORIES) as [NotifyCategory, ...NotifyCategory[]]),
    mode: z.enum(["immediate", "digest", "off"]),
    email: z.boolean(),
    push: z.boolean(),
  }),
);

/** Staff welcome, step 2: how you hear from us. */
export async function saveAlertPrefsAction(input: unknown): Promise<Res> {
  const me = await getSessionUser();
  if (!me) return { ok: false, error: "Not signed in." };
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Those settings did not look right. Reload and try again." };
  for (const p of parsed.data) await setPref(me.id, p);
  await markStep(me.id, "alerts");
  return { ok: true, message: "Alerts saved." };
}

const companySchema = z.object({
  company: z.string().trim().max(160).optional(),
  rcNumber: z.string().trim().max(40).optional(),
  taxId: z.string().trim().max(40).optional(),
  address: z.string().trim().max(400).optional(),
});

/** Client welcome: company details printed on quotes and invoices. */
export async function saveCompanyDetailsAction(input: z.infer<typeof companySchema>): Promise<Res> {
  const me = await getSessionUser();
  if (!me || roleOf(me) !== "client") return { ok: false, error: "Only client accounts have company details." };
  const parsed = companySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the details and try again." };
  const { getClientForUser } = await import("@/lib/db/queries/clients");
  const c = await getClientForUser(me.id, me.email, me.name);
  const d = parsed.data;
  // The tax id column carries "TIN · RC" when both are given (one field on invoices).
  const taxId = [d.taxId ? `TIN ${d.taxId.replace(/^TIN\s*/i, "")}` : null, d.rcNumber ? `RC ${d.rcNumber.replace(/^RC\s*/i, "")}` : null].filter(Boolean).join(" · ") || null;
  await db
    .update(client)
    .set({
      ...(d.company ? { company: d.company } : {}),
      ...(taxId ? { taxId } : {}),
      ...(d.address ? { address: d.address } : {}),
      updatedAt: new Date(),
    })
    .where(eq(client.id, c.id));
  await markStep(me.id, "company");
  await recordAudit({ action: "client.details_updated", entity: "client", entityId: c.id, actorId: me.id, actorName: me.name || me.email, meta: { by: "client", fields: Object.keys(d).filter((k) => d[k as keyof typeof d]) } });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Saved. These now print on your quotes and invoices." };
}
