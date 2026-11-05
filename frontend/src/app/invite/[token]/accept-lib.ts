import "server-only";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { client, user } from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit";
import { homeFor } from "@/lib/access";
import { siteOrigin } from "@/lib/site-url";
import type { Redeemed, RedeemFailure } from "@/lib/invitations";

/** Shared by the password accept action and the Google callback route (not a server action). */
export const REASON: Record<RedeemFailure, string> = {
  invalid: "This invitation link is not valid. Ask whoever invited you to send a new one.",
  redeemed: "This invitation was already used. Sign in instead.",
  revoked: "This invitation was withdrawn. Ask whoever invited you to send a new one.",
  expired: "This invitation has expired. Ask whoever invited you to send a new one.",
  exists: "There is already an account for this email. Sign in instead.",
  "weak-password": "Use at least 10 characters, mixing letters with a number or symbol.",
  "breached-password": "That password has appeared in a known data breach. Choose a different one.",
};

/** Audit + welcome + "accepted" note to the inviter. Shared with the Google route. */
export async function afterAccepted(res: Extract<Redeemed, { ok: true }>, method: "password" | "google") {
  await recordAudit({
    action: "invitation.accepted",
    entity: "invitation",
    entityId: res.invitationId,
    actorId: res.userId,
    actorName: res.name,
    meta: { email: res.email, role: res.role, clientId: res.clientId, method },
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

}

