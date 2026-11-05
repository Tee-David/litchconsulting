import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/lib/db/client";
import { client, clientMember, invitation, user } from "@/lib/db/schema";
import { siteOrigin } from "@/lib/site-url";

/**
 * Invitations (R1.2) — the only way a staff account or a client colleague is
 * made. Modelled on WDC's flow:
 *
 *  - The token is 32 random bytes (base64url). Only its SHA-256 is stored; the
 *    raw token exists in the email and nowhere else.
 *  - The EMAIL IS FIXED by the invitation. Redemption never takes an email
 *    from the form, so a forwarded link can only ever make that one account.
 *  - Single use, 7 days. Sending again replaces the link (new hash, new
 *    expiry); the old link stops working at once.
 *  - An address that already has an account cannot be invited — the person
 *    signs in the way they already do; an admin changes their role instead.
 *  - Redemption creates the user already VERIFIED (opening the link proves the
 *    inbox), with the invited role, and for a client colleague a
 *    `client_member` row linking them to the company.
 */

export const INVITE_TTL_DAYS = 7;
export const INVITE_PASSWORD_MIN = 10;
export type InviteRole = "admin" | "staff" | "client";
export type ColleagueAccess = "billing" | "reviewer" | "viewer";
export const COLLEAGUE_ACCESS: Record<ColleagueAccess, { label: string; hint: string }> = {
  billing: { label: "Billing contact", hint: "Gets invoices and receipts, and can pay." },
  reviewer: { label: "Reviewer", hint: "Can approve drafts and answer asks." },
  viewer: { label: "Can view", hint: "Sees requests, files and invoices." },
};
export type InviteState = "pending" | "redeemed" | "revoked" | "expired";
export type InvitationRow = typeof invitation.$inferSelect;

export const normaliseEmail = (email: string) => email.trim().toLowerCase();
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const TOKEN_RE = /^[A-Za-z0-9_-]{30,100}$/;

export function inviteState(i: Pick<InvitationRow, "redeemedAt" | "revokedAt" | "expiresAt">, now = Date.now()): InviteState {
  if (i.redeemedAt) return "redeemed";
  if (i.revokedAt) return "revoked";
  return new Date(i.expiresAt).getTime() <= now ? "expired" : "pending";
}

export const inviteUrl = (token: string) => `${siteOrigin()}/invite/${token}`;

export class InvitationError extends Error {}

async function accountExists(email: string): Promise<boolean> {
  const [row] = await db.select({ id: user.id }).from(user).where(sql`lower(${user.email}) = ${normaliseEmail(email)}`).limit(1);
  return Boolean(row);
}

/**
 * Make an invitation and return the raw token (put it in the email, then let
 * it go). An outstanding invitation for the same address is withdrawn in the
 * same transaction, so there are never two live links for one person.
 */
export async function createInvitation(input: {
  email: string;
  role: InviteRole;
  invitedBy: string;
  clientId?: string | null;
  access?: ColleagueAccess | null;
  message?: string | null;
}): Promise<{ invitation: InvitationRow; token: string }> {
  const email = normaliseEmail(input.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InvitationError("Enter a valid email address.");
  if (input.role === "client" && !input.clientId) throw new InvitationError("Choose the client company they should join.");
  if (await accountExists(email)) {
    throw new InvitationError("There is already an account for this email. Change their role in the team list instead.");
  }
  if (input.clientId) {
    const [c] = await db.select({ id: client.id, deletedAt: client.deletedAt }).from(client).where(eq(client.id, input.clientId)).limit(1);
    if (!c || c.deletedAt) throw new InvitationError("That client is in Trash or no longer exists.");
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const row = await db.transaction(async (tx) => {
    await tx
      .update(invitation)
      .set({ revokedAt: new Date() })
      .where(and(sql`lower(${invitation.email}) = ${email}`, isNull(invitation.redeemedAt), isNull(invitation.revokedAt)));
    const [created] = await tx
      .insert(invitation)
      .values({
        email,
        role: input.role,
        clientId: input.role === "client" ? input.clientId ?? null : null,
        access: input.role === "client" ? input.access ?? "viewer" : null,
        tokenHash: hashToken(token),
        message: input.message?.trim().slice(0, 500) || null,
        invitedBy: input.invitedBy,
        expiresAt,
        lastSentAt: new Date(),
      })
      .returning();
    return created;
  });
  return { invitation: row, token };
}

/**
 * Send again: a fresh token and a fresh 7 days on the same invitation. The
 * old link stops working (its hash is gone). Revoked or expired invitations
 * come back to life; accepted ones cannot be resent.
 */
export async function reissueInvitation(id: string): Promise<{ invitation: InvitationRow; token: string }> {
  const [row] = await db.select().from(invitation).where(eq(invitation.id, id)).limit(1);
  if (!row) throw new InvitationError("That invitation no longer exists.");
  if (row.redeemedAt) throw new InvitationError("That invitation was already accepted.");
  if (await accountExists(row.email)) throw new InvitationError("This person already has an account.");
  const token = randomBytes(32).toString("base64url");
  const [updated] = await db
    .update(invitation)
    .set({
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      revokedAt: null,
      lastSentAt: new Date(),
    })
    .where(and(eq(invitation.id, id), isNull(invitation.redeemedAt)))
    .returning();
  if (!updated) throw new InvitationError("That invitation was just accepted.");
  return { invitation: updated, token };
}

export async function revokeInvitation(id: string): Promise<InvitationRow | null> {
  const [row] = await db
    .update(invitation)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitation.id, id), isNull(invitation.redeemedAt), isNull(invitation.revokedAt)))
    .returning();
  return row ?? null;
}

export type InvitationView = InvitationRow & {
  state: InviteState;
  inviterName: string | null;
  inviterEmail: string | null;
  company: string | null;
};

/** The invitation a link names, in whatever state, or null. */
export async function invitationForToken(token: string): Promise<InvitationView | null> {
  if (!TOKEN_RE.test(token)) return null;
  const [row] = await db
    .select({ inv: invitation, inviterName: user.name, inviterEmail: user.email, company: client.company, clientName: client.name })
    .from(invitation)
    .leftJoin(user, eq(user.id, invitation.invitedBy))
    .leftJoin(client, eq(client.id, invitation.clientId))
    .where(eq(invitation.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) return null;
  return {
    ...row.inv,
    state: inviteState(row.inv),
    inviterName: row.inviterName,
    inviterEmail: row.inviterEmail,
    company: row.company || row.clientName || null,
  };
}

/** Every invitation, newest first (Settings → Access). */
export async function listInvitations(limit = 500) {
  const rows = await db
    .select({ inv: invitation, inviterName: user.name, company: client.company, clientName: client.name })
    .from(invitation)
    .leftJoin(user, eq(user.id, invitation.invitedBy))
    .leftJoin(client, eq(client.id, invitation.clientId))
    .orderBy(desc(invitation.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.inv, state: inviteState(r.inv), inviterName: r.inviterName, company: r.company || r.clientName || null }));
}

/** Password rule for invitation accounts (the auth layer enforces its own minimum too). */
export function passwordProblem(pw: string): string | null {
  if (pw.length < INVITE_PASSWORD_MIN) return `Use at least ${INVITE_PASSWORD_MIN} characters.`;
  if (pw.length > 128) return "That password is too long.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9\W_]/.test(pw)) return "Mix letters with at least one number or symbol.";
  return null;
}

/**
 * Has this password appeared in a known breach? k-anonymity range query to
 * Have I Been Pwned (only the first 5 hex chars of the SHA-1 leave us).
 * Fails open: an unreachable service never blocks a sign-up.
 */
export async function passwordBreached(pw: string): Promise<boolean> {
  try {
    const sha1 = createHash("sha1").update(pw).digest("hex").toUpperCase();
    const res = await fetch(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return false;
    const body = await res.text();
    return body.split("\n").some((line) => {
      const [suffix, count] = line.trim().split(":");
      return suffix === sha1.slice(5) && Number(count) > 0;
    });
  } catch {
    return false;
  }
}

export type RedeemFailure = "invalid" | "redeemed" | "revoked" | "expired" | "exists" | "weak-password" | "breached-password";
export type Redeemed =
  | { ok: true; userId: string; email: string; name: string; role: InviteRole; clientId: string | null; invitedBy: string; invitationId: string }
  | { ok: false; reason: RedeemFailure };

/**
 * Spend an invitation: create the verified account (with a password, or none
 * for "Continue with Google"), link a colleague to the company, and mark the
 * invitation used — all or nothing. The row is locked first, so two presses
 * of the same link cannot both succeed.
 */
export async function redeemInvitation(token: string, input: { name: string; password: string | null }): Promise<Redeemed> {
  if (!TOKEN_RE.test(token)) return { ok: false, reason: "invalid" };
  const password = input.password;
  if (password !== null) {
    if (passwordProblem(password)) return { ok: false, reason: "weak-password" };
    if (await passwordBreached(password)) return { ok: false, reason: "breached-password" };
  }
  // Hash outside the transaction: scrypt is slow on purpose; don't hold a lock across it.
  const hashed = password !== null ? await hashPassword(password) : null;

  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(invitation).where(eq(invitation.tokenHash, hashToken(token))).for("update").limit(1);
    if (!row) return { ok: false, reason: "invalid" } as const;
    const state = inviteState(row);
    if (state !== "pending") return { ok: false, reason: state } as const;
    const [existing] = await tx.select({ id: user.id }).from(user).where(sql`lower(${user.email}) = ${row.email}`).limit(1);
    if (existing) return { ok: false, reason: "exists" } as const;

    const userId = randomUUID();
    const name = input.name.trim().slice(0, 120) || row.email.split("@")[0];
    const now = new Date();
    const role: InviteRole = row.role === "admin" ? "admin" : row.role === "staff" ? "staff" : "client";
    await tx.insert(user).values({ id: userId, name, email: row.email, emailVerified: true, role, banned: false, createdAt: now, updatedAt: now });
    if (hashed) {
      await tx.execute(
        sql`INSERT INTO "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt") VALUES (${randomUUID()}, ${userId}, 'credential', ${userId}, ${hashed}, ${now}, ${now})`,
      );
    }
    if (role === "client" && row.clientId) {
      await tx
        .insert(clientMember)
        .values({ clientId: row.clientId, userId, access: row.access || "viewer", invitedBy: row.invitedBy })
        .onConflictDoNothing();
    }
    await tx.update(invitation).set({ redeemedAt: now, redeemedBy: userId }).where(eq(invitation.id, row.id));
    return { ok: true, userId, email: row.email, name, role, clientId: row.clientId, invitedBy: row.invitedBy, invitationId: row.id } as const;
  });
}

/** Send the invitation email for a freshly made (or re-issued) token. */
export async function sendInvitationEmail(inv: InvitationRow, token: string, inviterName: string) {
  const { sendTemplate } = await import("@/lib/email-templates");
  let company: string | null = null;
  if (inv.clientId) {
    const [c] = await db.select({ company: client.company, name: client.name }).from(client).where(eq(client.id, inv.clientId)).limit(1);
    company = c?.company || c?.name || null;
  }
  return sendTemplate(
    "invitation",
    {
      inviterName,
      role: inv.role === "admin" ? "admin" : inv.role === "staff" ? "staff" : "client",
      email: inv.email,
      url: inviteUrl(token),
      expiresAt: inv.expiresAt,
      company,
      access: inv.access,
      message: inv.message,
    },
    // Keyed on the token hash: a resend is a new event, a retry of the same send is not.
    { to: inv.email, dedupeKey: `invitation:${inv.id}:${inv.tokenHash.slice(0, 16)}` },
  );
}
