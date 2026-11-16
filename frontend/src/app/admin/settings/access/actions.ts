"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { sessionTwoStep, user } from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit";
import { getSessionUser, isAdmin } from "@/lib/server-user";
import { createInvitation, InvitationError, reissueInvitation, revokeInvitation, sendInvitationEmail } from "@/lib/invitations";
import { resetTwoStep, setTwoStepExempt } from "@/lib/two-step";
import { changeUserRoleAction } from "../actions";

/*
 * Settings → Team and access (R1.3). Admin only; every write is audit-logged.
 * Role changes go through the existing guard in ../actions (never your own
 * admin access, never the last active admin).
 */

type Res = { ok: true; message: string } | { ok: false; error: string };
const PATH = "/admin/settings/access";

async function admin() {
  const me = await getSessionUser();
  if (!me || !(await isAdmin())) return null;
  return me;
}

const inviteSchema = z.object({
  email: z.string().trim().email().max(200),
  role: z.enum(["staff", "admin"]),
  message: z.string().max(500).optional(),
});

export async function inviteTeamMemberAction(input: z.infer<typeof inviteSchema>): Promise<Res> {
  const me = await admin();
  if (!me) return { ok: false, error: "Only Admin can invite people to the team." };
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid email and choose a role." };
  try {
    const { invitation, token } = await createInvitation({ email: parsed.data.email, role: parsed.data.role, message: parsed.data.message, invitedBy: me.id });
    after(() => sendInvitationEmail(invitation, token, me.name || me.email).then(() => undefined).catch((e) => console.error("[access] invite email failed:", e)));
    await recordAudit({ action: "invitation.created", entity: "invitation", entityId: invitation.id, actorId: me.id, actorName: me.name || me.email, meta: { email: invitation.email, role: invitation.role } });
    revalidatePath(PATH);
    return { ok: true, message: `Invitation sent to ${invitation.email}. It works for 7 days.` };
  } catch (err) {
    if (err instanceof InvitationError) return { ok: false, error: err.message };
    console.error("[access] invite failed:", err);
    return { ok: false, error: "The invitation was not sent. Try again." };
  }
}

export async function resendInvitationAction(id: string): Promise<Res> {
  const me = await admin();
  if (!me) return { ok: false, error: "Only Admin can resend invitations." };
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Unknown invitation." };
  try {
    const { invitation, token } = await reissueInvitation(id);
    after(() => sendInvitationEmail(invitation, token, me.name || me.email).then(() => undefined).catch((e) => console.error("[access] resend email failed:", e)));
    await recordAudit({ action: "invitation.resent", entity: "invitation", entityId: invitation.id, actorId: me.id, actorName: me.name || me.email, meta: { email: invitation.email, role: invitation.role } });
    revalidatePath(PATH);
    return { ok: true, message: `Sent again to ${invitation.email}. The old link no longer works.` };
  } catch (err) {
    if (err instanceof InvitationError) return { ok: false, error: err.message };
    return { ok: false, error: "The invitation was not resent. Try again." };
  }
}

export async function revokeInvitationAction(id: string): Promise<Res> {
  const me = await admin();
  if (!me) return { ok: false, error: "Only Admin can withdraw invitations." };
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Unknown invitation." };
  const row = await revokeInvitation(id);
  if (!row) return { ok: false, error: "That invitation was already accepted or withdrawn." };
  await recordAudit({ action: "invitation.revoked", entity: "invitation", entityId: row.id, actorId: me.id, actorName: me.name || me.email, meta: { email: row.email, role: row.role } });
  revalidatePath(PATH);
  return { ok: true, message: `Withdrawn. The link sent to ${row.email} no longer works.` };
}

export async function changeTeamRoleAction(userId: string, role: string): Promise<Res> {
  const r = await changeUserRoleAction(userId, role);
  if (!r.ok) return { ok: false, error: r.error ?? "The role was not changed." };
  revalidatePath(PATH);
  return { ok: true, message: "Role changed. It applies from their next page load." };
}

async function target(userId: string) {
  if (typeof userId !== "string" || !userId) return null;
  const [u] = await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.id, userId)).limit(1);
  return u ?? null;
}

/** Lost phone and backup codes: remove the authenticator and sign them out; they enrol again at next sign-in. */
export async function resetTwoStepAction(userId: string): Promise<Res> {
  const me = await admin();
  if (!me) return { ok: false, error: "Only Admin can reset two-step sign-in." };
  const u = await target(userId);
  if (!u) return { ok: false, error: "That person no longer exists." };
  if (u.id === me.id) return { ok: false, error: "Reset your own from Profile and security, or ask another Admin." };
  await resetTwoStep(u.id);
  await recordAudit({ action: "auth.two_step_reset", entity: "user", entityId: u.id, actorId: me.id, actorName: me.name || me.email, meta: { email: u.email } });
  after(async () => {
    try {
      const { sendTemplate } = await import("@/lib/email-templates");
      await sendTemplate("securityNotice", { name: u.name, what: `${me.name || "An Admin"} reset your two-step sign-in`, when: new Date(), device: "Team and access" }, { to: u.email });
    } catch (err) {
      console.error("[access] reset notice failed:", err);
    }
  });
  revalidatePath(PATH);
  return { ok: true, message: `Two-step reset for ${u.name || u.email}. They are signed out and set it up again at next sign-in.` };
}

/**
 * Make two-step sign-in optional (exempt) or required again for one admin or staff
 * member. Admin only, never for yourself, always audit-logged and emailed.
 */
export async function setTwoStepRequiredAction(userId: string, required: boolean): Promise<Res> {
  const me = await admin();
  if (!me) return { ok: false, error: "Only Admin can change two-step sign-in rules." };
  const [u] = typeof userId === "string" && userId
    ? await db.select({ id: user.id, name: user.name, email: user.email, role: user.role }).from(user).where(eq(user.id, userId)).limit(1)
    : [];
  if (!u) return { ok: false, error: "That person no longer exists." };
  if (u.role !== "admin" && u.role !== "staff") return { ok: false, error: "Two-step rules apply to the firm's team only." };
  if (u.id === me.id) return { ok: false, error: "Another Admin must change your own two-step rule." };
  await setTwoStepExempt(u.id, !required, me.id);
  await recordAudit({
    action: required ? "auth.two_step_required" : "auth.two_step_exempt",
    entity: "user",
    entityId: u.id,
    actorId: me.id,
    actorName: me.name || me.email,
    meta: { email: u.email },
  });
  after(async () => {
    try {
      const { sendTemplate } = await import("@/lib/email-templates");
      await sendTemplate(
        "securityNotice",
        { name: u.name, what: `${me.name || "An Admin"} made two-step sign-in ${required ? "required" : "optional"} for you`, when: new Date(), device: "Team and access" },
        { to: u.email },
      );
    } catch (err) {
      console.error("[access] two-step rule notice failed:", err);
    }
  });
  revalidatePath(PATH);
  return {
    ok: true,
    message: required
      ? `Two-step is required again for ${u.name || u.email}. They set it up at their next page load if they have not.`
      : `Two-step is now optional for ${u.name || u.email}.`,
  };
}

export async function signOutEverywhereAction(userId: string): Promise<Res> {
  const me = await admin();
  if (!me) return { ok: false, error: "Only Admin can sign people out." };
  const u = await target(userId);
  if (!u) return { ok: false, error: "That person no longer exists." };
  if (u.id === me.id) return { ok: false, error: "Use Profile and security to sign out your own other devices." };
  const res = await db.execute(sql`DELETE FROM "session" WHERE "userId" = ${u.id}`);
  await db.delete(sessionTwoStep).where(eq(sessionTwoStep.userId, u.id));
  await recordAudit({ action: "auth.sessions_revoked", entity: "user", entityId: u.id, actorId: me.id, actorName: me.name || me.email, meta: { count: res.rowCount ?? 0, by: "admin" } });
  revalidatePath(PATH);
  const n = res.rowCount ?? 0;
  return { ok: true, message: n ? `${u.name || u.email} is signed out on ${n} ${n === 1 ? "device" : "devices"}.` : `${u.name || u.email} was not signed in anywhere.` };
}
