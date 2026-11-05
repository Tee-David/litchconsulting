"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { client, user } from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit";
import { rateLimit, callerKey } from "@/lib/rate-limit";
import { homeFor } from "@/lib/access";
import { siteOrigin } from "@/lib/site-url";
import { redeemInvitation, type RedeemFailure } from "@/lib/invitations";

/*
 * Accept an invitation (R1.2). The token is the only credential: it names one
 * invitation, the account is created verified for exactly that email, and the
 * role comes from the invitation row, never from the form.
 */

const REASON: Record<RedeemFailure, string> = {
  invalid: "This invitation link is not valid. Ask whoever invited you to send a new one.",
  redeemed: "This invitation was already used. Sign in instead.",
  revoked: "This invitation was withdrawn. Ask whoever invited you to send a new one.",
  expired: "This invitation has expired. Ask whoever invited you to send a new one.",
  exists: "There is already an account for this email. Sign in instead.",
  "weak-password": "Use at least 10 characters, mixing letters with a number or symbol.",
  "breached-password": "That password has appeared in a known data breach. Choose a different one.",
};

const schema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(2, "Enter your full name.").max(120),
  password: z.string().max(128).nullable(),
});

export type AcceptResult = { ok: true; email: string; withPassword: boolean } | { ok: false; error: string; reason?: RedeemFailure };

export async function acceptInvitationAction(input: z.infer<typeof schema>): Promise<AcceptResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const limited = await rateLimit(callerKey(await headers(), "invite-accept"), { limit: 15, windowSeconds: 3600 });
  if (!limited.ok) return { ok: false, error: "Too many tries from this connection. Wait a little and try again." };

  const res = await redeemInvitation(parsed.data.token, { name: parsed.data.name, password: parsed.data.password });
  if (!res.ok) return { ok: false, error: REASON[res.reason], reason: res.reason };

  await recordAudit({
    action: "invitation.accepted",
    entity: "invitation",
    entityId: res.invitationId,
    actorId: res.userId,
    actorName: res.name,
    meta: { email: res.email, role: res.role, clientId: res.clientId, method: parsed.data.password ? "password" : "google" },
  });

  after(async () => {
    try {
      const { sendTemplate } = await import("@/lib/email-templates");
      await sendTemplate("welcome", { name: res.name, role: res.role, homeUrl: `${siteOrigin()}${homeFor(res.role)}` }, { to: res.email, dedupeKey: `welcome:${res.userId}` });
      const [inviter] = await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, res.invitedBy)).limit(1);
      let company: string | null = null;
      if (res.clientId) {
        const [c] = await db.select({ company: client.company, name: client.name }).from(client).where(eq(client.id, res.clientId)).limit(1);
        company = c?.company || c?.name || null;
      }
      if (inviter?.email) {
        await sendTemplate(
          "inviteAccepted",
          { adminName: inviter.name, personName: res.name, personEmail: res.email, role: res.role, company },
          { to: inviter.email, dedupeKey: `invite-accepted:${res.invitationId}` },
        );
      }
    } catch (err) {
      console.error("[invite] follow-up emails failed:", err);
    }
  });

  return { ok: true, email: res.email, withPassword: parsed.data.password !== null };
}
