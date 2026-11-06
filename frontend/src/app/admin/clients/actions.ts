"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
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

/** The signed-in person's name, for Trash's "Moved by". */
async function whoName(): Promise<string | null> {
  const u = await getSessionUser();
  return u ? u.name || u.email : null;
}

/** Soft delete → Trash (recoverable; purged after 30 days). */
export async function deleteClient(id: string): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  await db.update(client).set({ deletedAt: new Date(), deletedBy: await whoName(), updatedAt: new Date() }).where(eq(client.id, id));
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
    .set({ deletedAt: new Date(), deletedBy: await whoName(), updatedAt: new Date() })
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
  const { sendTemplate } = await import("@/lib/email-templates");
  const { delivered } = await sendTemplate(
    "notice",
    {
      subject: "Your Litch Consulting client portal invitation",
      heading: "Your client portal is ready",
      name: row.name,
      paragraphs: ["We set up a secure portal for you: track your work, download what we deliver, pay invoices and reach us, in one place."],
      cta: { label: "Create your account", href: signupUrl },
      note: `Sign up with this address (${row.email}) so your records link automatically.`,
      why: "You got this because Litch Consulting added you as a client.",
    },
    { to: row.email, audience: "client" },
  ).catch(() => ({ delivered: false as const }));

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


/* ----------------------------- Client contacts ----------------------------- */

/** Invite a colleague of this client to the portal, with an access level. Audit-logged. */
export async function inviteClientContactAction(input: { clientId: string; email: string; access: string }): Promise<Result> {
  const me = await getSessionUser();
  if (!me || !(await isAdmin())) return { ok: false, error: "Only Admin can invite client contacts." };
  const { createInvitation, sendInvitationEmail, InvitationError } = await import("@/lib/invitations");
  const access = (["billing", "reviewer", "viewer"] as const).find((a) => a === input.access);
  if (!access) return { ok: false, error: "Choose what they can do." };
  try {
    const { invitation, token } = await createInvitation({ email: input.email, role: "client", clientId: input.clientId, access, invitedBy: me.id });
    await sendInvitationEmail(invitation, token, me.name || me.email).catch((e) => console.error("[clients] contact invite email failed:", e));
    await recordAudit({ action: "invitation.created", entity: "invitation", entityId: invitation.id, actorId: me.id, actorName: me.name || me.email, meta: { email: invitation.email, role: "client", access, clientId: input.clientId } });
    revalidatePath(`/admin/clients/${input.clientId}`);
    return { ok: true, id: input.clientId };
  } catch (err) {
    if (err instanceof InvitationError) return { ok: false, error: err.message };
    console.error("[clients] contact invite failed:", err);
    return { ok: false, error: "The invitation was not sent. Try again." };
  }
}

/* ------------------------------- CSV import -------------------------------- */

const importRow = z.object({
  name: z.string().trim().max(200).optional().default(""),
  company: z.string().trim().max(200).optional().default(""),
  email: z.string().trim().max(254).optional().default(""),
  phone: z.string().trim().max(60).optional().default(""),
  address: z.string().trim().max(500).optional().default(""),
  taxId: z.string().trim().max(100).optional().default(""),
});

/**
 * Import clients from a CSV (parsed in the browser). Rows without a name or
 * company, with a bad email, or whose email already exists are skipped and
 * reported. Audit-logged.
 */
export async function importClientsAction(rows: unknown[]): Promise<{ ok: boolean; created?: number; skipped?: { line: number; reason: string }[]; error?: string }> {
  const me = await getSessionUser();
  if (!me || !(await isAdmin())) return { ok: false, error: "Only Admin can import clients." };
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "The file has no rows." };
  if (rows.length > 500) return { ok: false, error: "Import up to 500 clients at a time." };

  const existing = await db.select({ email: client.email }).from(client).where(isNull(client.deletedAt));
  const seen = new Set(existing.map((e) => (e.email ?? "").toLowerCase()).filter(Boolean));
  const skipped: { line: number; reason: string }[] = [];
  const toInsert: ReturnType<typeof values>[] = [];
  rows.forEach((raw, i) => {
    const line = i + 2; // header is line 1
    const r = importRow.safeParse(raw);
    if (!r.success) return void skipped.push({ line, reason: "A value is too long." });
    const v = r.data;
    if (!v.name && !v.company) return void skipped.push({ line, reason: "No name or company." });
    const email = v.email.toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return void skipped.push({ line, reason: `"${v.email}" is not an email address.` });
    if (email && seen.has(email)) return void skipped.push({ line, reason: `${v.email} is already a client.` });
    if (email) seen.add(email);
    toInsert.push(values({ ...v, email }));
  });
  if (toInsert.length) await db.insert(client).values(toInsert);
  await recordAudit({ action: "client.imported", entity: "client", actorId: me.id, actorName: me.name || me.email, meta: { count: toInsert.length, skipped: skipped.length } });
  revalidatePath("/admin/clients");
  return { ok: true, created: toInsert.length, skipped };
}
