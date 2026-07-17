"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  client,
  clientNote,
  invoice,
  serviceRequest,
  ticket,
  payment,
  consultation,
} from "@/lib/db/schema";
import { isAdmin, getSessionUser } from "@/lib/server-user";
import { recordAudit } from "@/lib/audit";

export type ClientInput = {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  notes?: string;
};

type Result = { ok: boolean; id?: string; error?: string };

function values(input: ClientInput) {
  return {
    name: input.name || input.company || "Client",
    company: input.company || null,
    email: input.email || null,
    phone: input.phone || null,
    address: input.address || null,
    taxId: input.taxId || null,
    notes: input.notes || null,
  };
}

export async function createClient(input: ClientInput): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  if (!input.name && !input.company) return { ok: false, error: "Name or company required." };
  const [row] = await db.insert(client).values(values(input)).returning({ id: client.id });
  revalidatePath("/admin/clients");
  return { ok: true, id: row.id };
}

export async function updateClient(id: string, input: ClientInput): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  await db.update(client).set({ ...values(input), updatedAt: new Date() }).where(eq(client.id, id));
  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${id}`);
  return { ok: true };
}

/** Soft delete → Trash (recoverable; purged after 30 days). */
export async function deleteClient(id: string): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  await db.update(client).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(client.id, id));
  await recordAudit({ action: "client.deleted", entity: "client", entityId: id });
  revalidatePath("/admin/clients");
  revalidatePath("/admin/trash");
  return { ok: true, id };
}

export async function bulkDeleteClients(ids: string[]): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  if (!ids || ids.length === 0) return { ok: true };
  await db
    .update(client)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(inArray(client.id, ids));
  await recordAudit({ action: "client.bulk_deleted", entity: "client", meta: { count: ids.length } });
  revalidatePath("/admin/clients");
  revalidatePath("/admin/trash");
  return { ok: true };
}

/** Restore from Trash. */
export async function restoreClients(ids: string[]): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  if (!ids || ids.length === 0) return { ok: true };
  await db
    .update(client)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(inArray(client.id, ids));
  await recordAudit({
    action: "client.restored",
    entity: "client",
    entityId: ids.length === 1 ? ids[0] : null,
    meta: { count: ids.length },
  });
  revalidatePath("/admin/clients");
  revalidatePath("/admin/trash");
  return { ok: true };
}

/** Permanently delete (from Trash only). */
export async function purgeClients(ids: string[]): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  if (!ids || ids.length === 0) return { ok: true };
  await db.delete(client).where(inArray(client.id, ids));
  await recordAudit({
    action: "client.purged",
    entity: "client",
    entityId: ids.length === 1 ? ids[0] : null,
    meta: { count: ids.length },
  });
  revalidatePath("/admin/trash");
  return { ok: true };
}

/* ------------------------- Notes & tasks (hub rail) ------------------------ */

function revalidateHub(clientId: string) {
  revalidatePath(`/admin/clients/${clientId}`);
}

export async function addClientNoteAction(input: {
  clientId: string;
  kind: "note" | "task";
  body: string;
  dueDate?: string | null;
}): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  if (!input.body.trim()) return { ok: false, error: "Write something first." };
  const admin = await getSessionUser();
  const [row] = await db
    .insert(clientNote)
    .values({
      clientId: input.clientId,
      kind: input.kind,
      body: input.body.trim(),
      dueDate: input.kind === "task" ? input.dueDate || null : null,
      authorName: admin?.name || "Admin",
    })
    .returning({ id: clientNote.id });
  revalidateHub(input.clientId);
  return { ok: true, id: row.id };
}

export async function toggleClientNoteAction(clientId: string, noteId: string): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  const [row] = await db
    .select({ done: clientNote.done })
    .from(clientNote)
    .where(and(eq(clientNote.id, noteId), eq(clientNote.clientId, clientId)));
  if (!row) return { ok: false, error: "Not found" };
  await db
    .update(clientNote)
    .set({ done: !row.done, updatedAt: new Date() })
    .where(eq(clientNote.id, noteId));
  revalidateHub(clientId);
  return { ok: true };
}

export async function deleteClientNoteAction(clientId: string, noteId: string): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  await db
    .delete(clientNote)
    .where(and(eq(clientNote.id, noteId), eq(clientNote.clientId, clientId)));
  revalidateHub(clientId);
  return { ok: true };
}

/* ------------------------------ Merge duplicates --------------------------- */

/**
 * Fold `duplicateId` into `survivorId`: repoint every record, adopt the
 * dupe's portal link / contact fields where the survivor lacks them, append
 * its notes text, then delete the dupe. Invoice bill-to snapshots are
 * immutable, so billing history is unaffected.
 */
export async function mergeClientsAction(
  survivorId: string,
  duplicateId: string
): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  if (survivorId === duplicateId) return { ok: false, error: "Pick two different records." };

  try {
    await db.transaction(async (tx) => {
      const [survivor] = await tx.select().from(client).where(eq(client.id, survivorId));
      const [dupe] = await tx.select().from(client).where(eq(client.id, duplicateId));
      if (!survivor || !dupe) throw new Error("One of the records no longer exists.");

      const now = new Date();
      await tx.update(invoice).set({ clientId: survivorId, updatedAt: now }).where(eq(invoice.clientId, duplicateId));
      await tx
        .update(serviceRequest)
        .set({ clientId: survivorId, updatedAt: now })
        .where(eq(serviceRequest.clientId, duplicateId));
      await tx.update(ticket).set({ clientId: survivorId, updatedAt: now }).where(eq(ticket.clientId, duplicateId));
      await tx.update(payment).set({ clientId: survivorId, updatedAt: now }).where(eq(payment.clientId, duplicateId));
      await tx
        .update(consultation)
        .set({ clientId: survivorId, updatedAt: now })
        .where(eq(consultation.clientId, duplicateId));
      await tx
        .update(clientNote)
        .set({ clientId: survivorId, updatedAt: now })
        .where(eq(clientNote.clientId, duplicateId));

      await tx
        .update(client)
        .set({
          userId: survivor.userId ?? dupe.userId,
          company: survivor.company || dupe.company,
          phone: survivor.phone || dupe.phone,
          address: survivor.address || dupe.address,
          taxId: survivor.taxId || dupe.taxId,
          notes: [survivor.notes, dupe.notes].filter(Boolean).join("\n---\n") || null,
          updatedAt: now,
        })
        .where(eq(client.id, survivorId));

      await tx.delete(client).where(eq(client.id, duplicateId));
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Merge failed" };
  }

  await recordAudit({
    action: "client.merged",
    entity: "client",
    entityId: survivorId,
    meta: { survivorId, duplicateId },
  });
  revalidatePath("/admin/clients");
  revalidateHub(survivorId);
  return { ok: true, id: survivorId };
}

/* ------------------------------ Portal invite ------------------------------ */

export async function inviteClientToPortalAction(clientId: string): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  const [row] = await db.select().from(client).where(eq(client.id, clientId));
  if (!row) return { ok: false, error: "Not found" };
  if (!row.email) return { ok: false, error: "Add an email address first." };
  if (row.userId) return { ok: false, error: "This client already has a portal account." };

  const base = (process.env.BETTER_AUTH_URL || "https://litchconsulting.com").replace(/\/$/, "");
  const signupUrl = `${base}/signup?email=${encodeURIComponent(row.email)}`;
  const { sendEmail, emailLayout } = await import("@/lib/email");
  const { delivered } = await sendEmail({
    to: row.email,
    subject: "Your Litch Consulting client portal invitation",
    html: emailLayout(`
      <p style="margin:0 0 14px;">Hi ${row.name || "there"},</p>
      <p style="margin:0 0 18px;">We've set up a secure client portal for you — track your engagements, download deliverables, pay invoices, and reach us any time, all in one place.</p>
      <p style="margin:0 0 20px;"><a href="${signupUrl}" style="display:inline-block;background:#0a196d;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:9999px;">Create your account</a></p>
      <p style="margin:0;color:#5b6474;font-size:13px;">Use this email address (${row.email}) when signing up so your records link automatically.</p>
    `),
  }).catch(() => ({ delivered: false as const }));

  if (delivered) {
    await recordAudit({
      action: "client.invited",
      entity: "client",
      entityId: clientId,
      meta: { email: row.email },
    });
    return { ok: true };
  }
  return { ok: false, error: "Email isn't configured — invite not sent." };
}

/* -------------------------------- NDPA erase ------------------------------- */

/** Erase the client's AI-pipeline data on the LitchAI VM (documents, line items, memory). */
export async function eraseClientAiDataAction(clientId: string): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  if (!process.env.LITCHAI_API_URL) return { ok: false, error: "LitchAI isn't configured." };
  try {
    const { eraseClient } = await import("@/lib/litchai/client");
    await eraseClient(clientId);
    await recordAudit({ action: "client.ai_erased", entity: "client", entityId: clientId });
    revalidateHub(clientId);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erase failed";
    return {
      ok: false,
      error: msg.includes("404") ? "Erase isn't available on the backend yet." : msg,
    };
  }
}

