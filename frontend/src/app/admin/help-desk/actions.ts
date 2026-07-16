"use server";

import { revalidatePath } from "next/cache";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { ticket, ticketMessage } from "@/lib/db/schema";
import { isAdmin, getCurrentUserId } from "@/lib/server-user";
import { nextTicketNumber } from "@/lib/db/queries/tickets";

type ActionResult = { ok: boolean; id?: string; error?: string };

export type NewTicketInput = {
  subject: string;
  requesterName?: string;
  requesterEmail?: string;
  priority?: string;
  category?: string;
  message: string;
};

async function requireAdmin(): Promise<string | null> {
  if (!(await isAdmin())) return null;
  return getCurrentUserId();
}

function revalidate() {
  revalidatePath("/admin/help-desk");
  revalidatePath("/admin");
}

/** Log a new ticket (e.g. from a phone/email enquiry) with its first message. */
export async function createTicketAction(input: NewTicketInput): Promise<ActionResult> {
  const uid = await requireAdmin();
  if (!uid) return { ok: false, error: "Unauthorized" };
  if (!input.subject.trim()) return { ok: false, error: "A subject is required." };

  const number = await nextTicketNumber();
  const now = new Date();
  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(ticket)
      .values({
        number,
        subject: input.subject.trim(),
        requesterName: input.requesterName?.trim() || null,
        requesterEmail: input.requesterEmail?.trim() || null,
        priority: input.priority || "normal",
        category: input.category || "general",
        status: "open",
        createdByUserId: uid,
        lastReplyAt: now,
      })
      .returning({ id: ticket.id });
    if (input.message.trim()) {
      await tx.insert(ticketMessage).values({
        ticketId: row.id,
        authorName: input.requesterName?.trim() || "Requester",
        authorRole: "client",
        body: input.message.trim(),
      });
    }
    return row.id;
  });
  revalidate();
  return { ok: true, id };
}

/** Post an agent reply and optionally send it to the requester by email. */
export async function replyTicketAction(id: string, body: string, notify = true): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  if (!body.trim()) return { ok: false, error: "Write a reply first." };

  const [t] = await db.select().from(ticket).where(eq(ticket.id, id)).limit(1);
  if (!t) return { ok: false, error: "Not found" };

  await db.insert(ticketMessage).values({ ticketId: id, authorName: "Litch Consulting", authorRole: "agent", body: body.trim() });
  await db.update(ticket).set({ status: t.status === "open" ? "pending" : t.status, lastReplyAt: new Date(), updatedAt: new Date() }).where(eq(ticket.id, id));

  let note: string | undefined;
  if (notify && t.requesterEmail) {
    try {
      const { sendEmail, emailLayout } = await import("@/lib/email");
      const html = emailLayout(`
        <p style="margin:0 0 14px;">Hi ${t.requesterName || "there"},</p>
        <p style="margin:0 0 18px;white-space:pre-line;">${body.trim().replace(/</g, "&lt;")}</p>
        <p style="margin:0;color:#5b6474;font-size:13px;">Re: ${t.subject} · ${t.number}</p>
      `);
      const { delivered } = await sendEmail({ to: t.requesterEmail, subject: `Re: ${t.subject} [${t.number}]`, html });
      if (!delivered) note = "Reply saved (email not configured).";
    } catch {
      note = "Reply saved (email failed to send).";
    }
  }
  revalidate();
  return { ok: true, error: note };
}

export async function setTicketStatusAction(id: string, status: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  await db.update(ticket).set({ status, updatedAt: new Date() }).where(eq(ticket.id, id));
  revalidate();
  return { ok: true };
}

export async function setTicketPriorityAction(id: string, priority: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  await db.update(ticket).set({ priority, updatedAt: new Date() }).where(eq(ticket.id, id));
  revalidate();
  return { ok: true };
}

export async function assignTicketAction(id: string, assignee: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  await db.update(ticket).set({ assignee: assignee.trim() || null, updatedAt: new Date() }).where(eq(ticket.id, id));
  revalidate();
  return { ok: true };
}

/** Which desk owns the ticket — Support / Finance / Advisory. */
export async function setTicketTeamAction(id: string, team: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  await db.update(ticket).set({ team: team.trim() || null, updatedAt: new Date() }).where(eq(ticket.id, id));
  revalidate();
  return { ok: true };
}

/** What kind of request this is — question / problem / request / billing. */
export async function setTicketTypeAction(id: string, type: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  await db.update(ticket).set({ type: type.trim() || null, updatedAt: new Date() }).where(eq(ticket.id, id));
  revalidate();
  return { ok: true };
}

/** Replace the ticket's label chips (`tags` jsonb) — de-duped, trimmed, capped. */
export async function setTicketTagsAction(id: string, tags: string[]): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  const clean = Array.from(
    new Set((tags || []).map((t) => t.trim()).filter((t) => t.length > 0 && t.length <= 32)),
  ).slice(0, 12);
  await db.update(ticket).set({ tags: clean, updatedAt: new Date() }).where(eq(ticket.id, id));
  revalidate();
  return { ok: true };
}

/**
 * Ask LitchAI to draft an agent reply from the ticket thread. Gated on
 * LITCHAI_API_URL — the button is only rendered when it's set. The backend's
 * support surface isn't live yet, so a failed call surfaces its own error
 * rather than pretending to have drafted something.
 */
export async function draftTicketReplyAction(
  ticketId: string,
): Promise<ActionResult & { draft?: string }> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  if (!process.env.LITCHAI_API_URL) return { ok: false, error: "LitchAI isn't configured." };

  const [t] = await db.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1);
  if (!t) return { ok: false, error: "Not found" };

  const thread = await db
    .select()
    .from(ticketMessage)
    .where(eq(ticketMessage.ticketId, ticketId))
    .orderBy(asc(ticketMessage.createdAt));
  if (thread.length === 0) return { ok: false, error: "Nothing to draft from — the thread is empty." };

  try {
    const res = await fetch(new URL("/support/draft-reply", process.env.LITCHAI_API_URL), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Access-Client-Id": process.env.LITCHAI_ACCESS_CLIENT_ID || "",
        "CF-Access-Client-Secret": process.env.LITCHAI_ACCESS_CLIENT_SECRET || "",
      },
      body: JSON.stringify({
        subject: t.subject,
        category: t.category,
        requester_name: t.requesterName,
        messages: thread.map((m) => ({ role: m.authorRole, body: m.body })),
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        ok: false,
        error:
          res.status === 404
            ? "The LitchAI support assistant isn't available yet."
            : `LitchAI draft → ${res.status}`,
      };
    }
    const data = (await res.json()) as { draft?: string; answer?: string };
    const draft = (data.draft || data.answer || "").trim();
    if (!draft) return { ok: false, error: "LitchAI returned an empty draft." };
    return { ok: true, draft };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Assistant unavailable" };
  }
}

export async function deleteTicketAction(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  await db.transaction(async (tx) => {
    await tx.delete(ticketMessage).where(eq(ticketMessage.ticketId, id));
    await tx.delete(ticket).where(eq(ticket.id, id));
  });
  revalidate();
  return { ok: true };
}

export async function bulkDeleteTicketsAction(ids: string[]): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  if (!ids || ids.length === 0) return { ok: true };

  try {
    await db.transaction(async (tx) => {
      await tx.delete(ticketMessage).where(inArray(ticketMessage.ticketId, ids));
      await tx.delete(ticket).where(inArray(ticket.id, ids));
    });
    revalidate();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not delete tickets" };
  }
}

export async function bulkSetTicketStatusAction(ids: string[], status: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  if (!ids || ids.length === 0) return { ok: true };

  try {
    await db.update(ticket).set({ status, updatedAt: new Date() }).where(inArray(ticket.id, ids));
    revalidate();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not update tickets status" };
  }
}

export async function bulkSetTicketPriorityAction(ids: string[], priority: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  if (!ids || ids.length === 0) return { ok: true };

  try {
    await db.update(ticket).set({ priority, updatedAt: new Date() }).where(inArray(ticket.id, ids));
    revalidate();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not update tickets priority" };
  }
}

