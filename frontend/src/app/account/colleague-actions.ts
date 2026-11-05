"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/server-user";
import { roleOf } from "@/lib/access";
import { recordAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { createInvitation, InvitationError, markStepSafe, sendInvitationEmail } from "./colleague-lib";

/*
 * A client contact invites a colleague to THEIR company (R1.2): billing
 * contact, reviewer or viewer. The company comes from the session, never from
 * the form, so a client can only ever add people to their own company.
 */

const schema = z.object({ email: z.string().trim().email().max(200), access: z.enum(["billing", "reviewer", "viewer"]), message: z.string().max(500).optional() });

export async function inviteColleagueAction(input: z.infer<typeof schema>): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const me = await getSessionUser();
  if (!me || me.banned || roleOf(me) !== "client") return { ok: false, error: "Only client accounts can invite colleagues." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid email and choose what they can do." };
  const limited = await rateLimit(`invite-colleague:${me.id}`, { limit: 10, windowSeconds: 3600 });
  if (!limited.ok) return { ok: false, error: "You have sent a lot of invitations. Try again in an hour." };
  if (parsed.data.email.toLowerCase() === me.email.toLowerCase()) return { ok: false, error: "That is your own email." };

  const { getClientForUser } = await import("@/lib/db/queries/clients");
  const c = await getClientForUser(me.id, me.email, me.name);
  try {
    const { invitation, token } = await createInvitation({
      email: parsed.data.email,
      role: "client",
      clientId: c.id,
      access: parsed.data.access,
      message: parsed.data.message,
      invitedBy: me.id,
    });
    after(() => sendInvitationEmail(invitation, token, me.name || me.email).catch((e) => console.error("[colleague] email failed:", e)));
    await recordAudit({ action: "invitation.created", entity: "invitation", entityId: invitation.id, actorId: me.id, actorName: me.name || me.email, meta: { email: invitation.email, role: "client", access: parsed.data.access, clientId: c.id, by: "client" } });
    await markStepSafe(me.id, "colleague");
    revalidatePath("/account/welcome");
    return { ok: true, message: `Invitation sent to ${invitation.email}. It works for 7 days.` };
  } catch (err) {
    if (err instanceof InvitationError) return { ok: false, error: err.message };
    console.error("[colleague] invite failed:", err);
    return { ok: false, error: "The invitation was not sent. Try again." };
  }
}
