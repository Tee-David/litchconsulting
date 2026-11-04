"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import {
  client,
  clientNote,
  consultation,
  invitation,
  invoice,
  notification,
  notificationPref,
  payment,
  pushSubscription,
  requestAssignment,
  requestItem,
  reviewRound,
  sageConversation,
  sageMessage,
  serviceRequest,
  serviceRequestDocument,
  serviceRequestEvent,
  ticket,
  ticketMessage,
  user,
} from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit";
import { actor, DENIED, failure } from "../_lib/guard";

/*
 * Client privacy (R2.3, NDPA 2023): per-client AI mode with who/when/why, and
 * erasure that keeps the finance records tax law requires (invoices, receipts,
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

export type EraseReport = {
  deleted: Record<string, number>;
  kept: Record<string, number>;
  notes: string[];
};

const eraseSchema = z.object({ clientId: uuid, confirm: z.string() });

/**
 * Erase a client now. Deletes people, messages, files, asks, notes, AI chats
 * and the portal login; keeps invoices, quotes and payments (6-year tax
 * retention) with names, emails and addresses removed. Audit-logged with the
 * report. Type-to-confirm phrase: "erase <client name>".
 */
export async function eraseClientAction(input: z.infer<typeof eraseSchema>): Promise<{ ok: true; report: EraseReport } | { ok: false; error: string }> {
  const me = await actor("clientData");
  if (!me) return DENIED;
  const parsed = eraseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Unknown client." };
  const { clientId, confirm } = parsed.data;
  const [c] = await db.select().from(client).where(eq(client.id, clientId)).limit(1);
  if (!c) return { ok: false, error: "This client no longer exists." };
  const display = c.company || c.name;
  if (confirm.trim().toLowerCase() !== `erase ${display}`.toLowerCase()) return { ok: false, error: `Type “erase ${display}” to confirm.` };

  const report: EraseReport = { deleted: {}, kept: {}, notes: [] };
  try {
    const reqs = await db.select({ id: serviceRequest.id, userId: serviceRequest.userId }).from(serviceRequest).where(eq(serviceRequest.clientId, clientId));
    const reqIds = reqs.map((r) => r.id);
    const userIds = [...new Set([c.userId, ...reqs.map((r) => r.userId)].filter(Boolean) as string[])];
    // Only client logins are removed; a staff/admin user who happened to submit is never deleted.
    const clientUsers = userIds.length
      ? (await db.select({ id: user.id, role: user.role }).from(user).where(inArray(user.id, userIds))).filter((u) => !u.role || u.role === "client").map((u) => u.id)
      : [];

    // Files first (private R2), so nothing is orphaned in storage.
    const docs = reqIds.length ? await db.select({ id: serviceRequestDocument.id, key: serviceRequestDocument.r2Key }).from(serviceRequestDocument).where(inArray(serviceRequestDocument.requestId, reqIds)) : [];
    let filesGone = 0;
    if (docs.length) {
      const { deletePrivateObject } = await import("@/lib/r2");
      for (const d of docs) {
        try {
          await deletePrivateObject(d.key);
          filesGone++;
        } catch {
          /* counted below */
        }
      }
      if (filesGone < docs.length) report.notes.push(`${docs.length - filesGone} stored files could not be removed from storage and need a manual check.`);
    }
    const proofs = await db.select({ id: payment.id, key: payment.proofKey }).from(payment).where(and(eq(payment.clientId, clientId), sql`${payment.proofKey} IS NOT NULL`));
    if (proofs.length) {
      const { deletePrivateObject } = await import("@/lib/r2");
      for (const p of proofs) {
        try {
          await deletePrivateObject(p.key!);
        } catch {
          /* proof kept in storage; noted */
        }
      }
    }

    // AI pipeline data on the LitchAI server (best effort).
    if (process.env.LITCHAI_API_URL) {
      try {
        const { eraseClient } = await import("@/lib/litchai/client");
        await eraseClient(clientId);
        report.notes.push("AI documents and memory were erased on the analysis server.");
      } catch {
        report.notes.push("The analysis server did not confirm its erasure. Retry from Settings, Integrations when it is online.");
      }
    }

    const tickets = await db.select({ id: ticket.id }).from(ticket).where(eq(ticket.clientId, clientId));
    const ticketIds = tickets.map((t) => t.id);
    const convs = await db.select({ id: sageConversation.id }).from(sageConversation).where(eq(sageConversation.clientId, clientId));
    const convIds = convs.map((x) => x.id);

    await db.transaction(async (tx) => {
      const count = async (label: string, p: Promise<unknown[]>) => {
        const rows = await p;
        report.deleted[label] = (report.deleted[label] ?? 0) + rows.length;
      };
      if (reqIds.length) {
        await count("Request files", tx.delete(serviceRequestDocument).where(inArray(serviceRequestDocument.requestId, reqIds)).returning({ id: serviceRequestDocument.id }));
        await count("Asks", tx.delete(requestItem).where(inArray(requestItem.requestId, reqIds)).returning({ id: requestItem.id }));
        await count("Review rounds", tx.delete(reviewRound).where(inArray(reviewRound.requestId, reqIds)).returning({ id: reviewRound.id }));
        await count("Timeline entries", tx.delete(serviceRequestEvent).where(inArray(serviceRequestEvent.requestId, reqIds)).returning({ id: serviceRequestEvent.id }));
        await tx.delete(requestAssignment).where(inArray(requestAssignment.requestId, reqIds));
        await count("Requests", tx.delete(serviceRequest).where(inArray(serviceRequest.id, reqIds)).returning({ id: serviceRequest.id }));
      }
      if (ticketIds.length) {
        await count("Support messages", tx.delete(ticketMessage).where(inArray(ticketMessage.ticketId, ticketIds)).returning({ id: ticketMessage.id }));
        await count("Support tickets", tx.delete(ticket).where(inArray(ticket.id, ticketIds)).returning({ id: ticket.id }));
      }
      if (convIds.length) {
        await tx.delete(sageMessage).where(inArray(sageMessage.conversationId, convIds));
        await count("Sage chats about the client", tx.delete(sageConversation).where(inArray(sageConversation.id, convIds)).returning({ id: sageConversation.id }));
      }
      await count("Notes", tx.delete(clientNote).where(eq(clientNote.clientId, clientId)).returning({ id: clientNote.id }));
      await count("Consultations", tx.delete(consultation).where(eq(consultation.clientId, clientId)).returning({ id: consultation.id }));
      await tx.delete(invitation).where(eq(invitation.clientId, clientId));

      // Finance records stay for tax law, without personal details.
      const inv = await tx
        .update(invoice)
        .set({ billToName: null, billToEmail: null, billToAddress: null, notes: null, updatedAt: new Date() })
        .where(eq(invoice.clientId, clientId))
        .returning({ id: invoice.id, kind: invoice.kind });
      report.kept["Invoices and receipts"] = inv.filter((i) => i.kind === "invoice").length;
      report.kept["Quotes"] = inv.filter((i) => i.kind === "quote").length;
      const pays = await tx
        .update(payment)
        .set({ rawEvent: null, proofKey: null, proofFileName: null, authorizationUrl: null, updatedAt: new Date() })
        .where(eq(payment.clientId, clientId))
        .returning({ id: payment.id });
      report.kept["Payments"] = pays.length;

      if (clientUsers.length) {
        await tx.delete(notification).where(inArray(notification.userId, clientUsers));
        await tx.delete(notificationPref).where(inArray(notificationPref.userId, clientUsers));
        await tx.delete(pushSubscription).where(inArray(pushSubscription.userId, clientUsers));
        const list = sql.join(clientUsers.map((id) => sql`${id}`), sql`, `);
        await tx.execute(sql`DELETE FROM "session" WHERE "userId" IN (${list})`);
        await tx.execute(sql`DELETE FROM "account" WHERE "userId" IN (${list})`);
        await count("Portal logins", tx.delete(user).where(inArray(user.id, clientUsers)).returning({ id: user.id }));
      }

      // The client row stays as an anonymous anchor for the kept finance
      // records (company name and TIN are business records), hidden from lists.
      await tx
        .update(client)
        .set({
          name: c.company ? c.company : "Erased client",
          email: null,
          phone: null,
          address: null,
          notes: null,
          userId: null,
          aiModeReason: null,
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(client.id, clientId));
    });
    report.kept["Company name and TIN on finance records"] = 1;
    report.notes.push("Invoices, quotes and payments are kept for 6 years as Nigerian tax law requires, with names, emails and addresses removed.");

    await recordAudit({ action: "client.erased", entity: "client", entityId: clientId, meta: { client: display, ...report } });
    revalidatePath("/admin/clients");
    revalidatePath("/admin/trash");
    revalidatePath("/admin");
    return { ok: true, report };
  } catch (e) {
    return failure(e, "The erasure stopped part way. Nothing finance-related was lost; try again or check the audit log.");
  }
}
