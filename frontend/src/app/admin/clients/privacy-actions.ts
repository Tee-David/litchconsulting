"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { client } from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit";
import { actor, DENIED, failure } from "../_lib/guard";
import { clientLoginIds, eraseClientData, ERASURE_HOLD_DAYS, type EraseReport } from "@/lib/privacy/erase";

export type { EraseReport };

/*
 * Client privacy (R2.3, NDPA 2023): per-client AI mode with who/when/why, and
 * erasure (after a 30-day, cancellable hold) that keeps the finance records tax law requires (invoices, receipts,
 * payments) with personal details removed, and reports what it kept.
 */

const uuid = z.string().uuid();
const modeSchema = z
  .object({ clientId: uuid, mode: z.enum(["cloud_masked", "local_only"]), reason: z.string().trim().max(500).optional() })
  .refine((v) => v.mode !== "local_only" || (v.reason?.length ?? 0) >= 3, { message: "Say why this client's data must stay local." });

export async function setAiModeAction(input: z.infer<typeof modeSchema>): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const me = await actor("clientData");
  if (!me) return DENIED;
  const parsed = modeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const { clientId, mode, reason } = parsed.data;
  const [c] = await db.select({ aiMode: client.aiMode, name: client.name, company: client.company }).from(client).where(eq(client.id, clientId)).limit(1);
  if (!c) return { ok: false, error: "This client no longer exists." };
  await db
    .update(client)
    .set({ aiMode: mode, aiModeReason: reason || null, aiModeSetBy: me.displayName, aiModeSetAt: new Date(), updatedAt: new Date() })
    .where(eq(client.id, clientId));
  await recordAudit({ action: "client.ai_mode_changed", entity: "client", entityId: clientId, meta: { from: c.aiMode, to: mode, reason: reason || null, client: c.company || c.name } });
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/admin/clients");
  return {
    ok: true,
    message: mode === "local_only" ? "Local only. Sage, the workbench and help-desk triage keep this client's data on our server." : "Cloud, masked. Names, accounts and TINs are tokenised before any model sees them.",
  };
}

const eraseSchema = z.object({ clientId: uuid, confirm: z.string() });

async function loadForErase(input: z.infer<typeof eraseSchema>) {
  const parsed = eraseSchema.safeParse(input);
  if (!parsed.success) return { error: "Unknown client." } as const;
  const { clientId, confirm } = parsed.data;
  const [c] = await db.select().from(client).where(eq(client.id, clientId)).limit(1);
  if (!c || c.erasedAt) return { error: "This client no longer exists." } as const;
  const display = c.company || c.name;
  if (confirm.trim().toLowerCase() !== `erase ${display}`.toLowerCase()) return { error: `Type “erase ${display}” to confirm.` } as const;
  return { c, display } as const;
}

function revalidateClient(clientId: string) {
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/admin/clients");
  revalidatePath("/admin/trash");
  revalidatePath("/admin");
}

/**
 * Schedule erasure. Nothing is deleted yet: the client's portal is closed
 * (sessions signed out; the portal shows the erasure date) and the nightly
 * sweep erases the data after ERASURE_HOLD_DAYS unless someone cancels.
 * Type-to-confirm phrase: "erase <client name>".
 */
export async function scheduleErasureAction(
  input: z.infer<typeof eraseSchema>,
): Promise<{ ok: true; message: string; dueAt: string } | { ok: false; error: string }> {
  const me = await actor("clientData");
  if (!me) return DENIED;
  const r = await loadForErase(input);
  if ("error" in r) return { ok: false, error: r.error! };
  const { c, display } = r;
  if (c.erasureRequestedAt) return { ok: false, error: "Erasure is already scheduled for this client." };
  try {
    const now = new Date();
    await db.update(client).set({ erasureRequestedAt: now, erasureRequestedBy: me.id, updatedAt: now }).where(eq(client.id, c.id));
    const logins = await clientLoginIds(c);
    if (logins.length) {
      await db.execute(sql`DELETE FROM "session" WHERE "userId" IN (${sql.join(logins.map((id) => sql`${id}`), sql`, `)})`);
    }
    const dueAt = new Date(now.getTime() + ERASURE_HOLD_DAYS * 86_400_000);
    await recordAudit({
      action: "client.erasure_scheduled",
      entity: "client",
      entityId: c.id,
      meta: { client: display, dueAt: dueAt.toISOString(), portalLoginsSignedOut: logins.length },
    });
    revalidateClient(c.id);
    return {
      ok: true,
      dueAt: dueAt.toISOString(),
      message: `Erasure scheduled for ${dueAt.toLocaleDateString("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "long", year: "numeric" })}. You can cancel until then.`,
    };
  } catch (e) {
    return failure(e, "Could not schedule the erasure. Nothing was changed.");
  }
}

/** Cancel a scheduled erasure; the client's portal opens again. */
export async function cancelErasureAction(input: { clientId: string }): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const me = await actor("clientData");
  if (!me) return DENIED;
  const parsed = uuid.safeParse(input?.clientId);
  if (!parsed.success) return { ok: false, error: "Unknown client." };
  const [c] = await db.select().from(client).where(eq(client.id, parsed.data)).limit(1);
  if (!c || c.erasedAt) return { ok: false, error: "This client has already been erased." };
  if (!c.erasureRequestedAt) return { ok: false, error: "No erasure is scheduled for this client." };
  try {
    await db.update(client).set({ erasureRequestedAt: null, erasureRequestedBy: null, updatedAt: new Date() }).where(eq(client.id, c.id));
    await recordAudit({ action: "client.erasure_cancelled", entity: "client", entityId: c.id, meta: { client: c.company || c.name, scheduledAt: c.erasureRequestedAt.toISOString() } });
    revalidateClient(c.id);
    return { ok: true, message: "Erasure cancelled. Nothing was removed and the client can sign in again." };
  } catch (e) {
    return failure(e, "Could not cancel the erasure. Try again.");
  }
}

/**
 * Erase now, skipping the rest of the hold — only for a client whose erasure
 * is already scheduled (e.g. the client asked for it in writing). Same
 * type-to-confirm phrase. Audit-logged with the report.
 */
export async function eraseNowAction(input: z.infer<typeof eraseSchema>): Promise<{ ok: true; report: EraseReport } | { ok: false; error: string }> {
  const me = await actor("clientData");
  if (!me) return DENIED;
  const r = await loadForErase(input);
  if ("error" in r) return { ok: false, error: r.error! };
  const { c, display } = r;
  if (!c.erasureRequestedAt) return { ok: false, error: "Schedule the erasure first; it can then be run early." };
  try {
    const report = await eraseClientData(c);
    await recordAudit({ action: "client.erased", entity: "client", entityId: c.id, meta: { client: display, early: true, ...report } });
    revalidateClient(c.id);
    return { ok: true, report };
  } catch (e) {
    return failure(e, "The erasure stopped part way. Nothing finance-related was lost; try again or check the audit log.");
  }
}
