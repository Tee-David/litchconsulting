"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { ticket, ticketMessage } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/server-user";
import { getClientForUser } from "@/lib/db/queries/clients";
import { nextTicketNumber } from "@/lib/db/queries/tickets";
import { sendTemplate } from "@/lib/email-templates";
import { notifyFirm } from "@/lib/requests/people";

type ActionResult = { ok: boolean; id?: string; error?: string };

const adminEmail = process.env.SMTP_USER || "info@litchconsulting.com";

export async function createClientTicketAction(input: {
  subject: string;
  category: string;
  message: string;
  /** optional service_request this ticket is about (ownership-checked) */
  requestId?: string | null;
}): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user || user.role !== "client") return { ok: false, error: "Unauthorized" };

  if (!input.subject.trim()) return { ok: false, error: "Subject is required." };
  if (!input.message.trim()) return { ok: false, error: "Initial message is required." };

  const clientRow = await getClientForUser(user.id, user.email, user.name);

  // Only link a request the client actually owns.
  let requestId: string | null = null;
  if (input.requestId) {
    const { serviceRequest } = await import("@/lib/db/schema");
    const { and: andOp, eq: eqOp } = await import("drizzle-orm");
    const [own] = await db
      .select({ id: serviceRequest.id })
      .from(serviceRequest)
      .where(andOp(eqOp(serviceRequest.id, input.requestId), eqOp(serviceRequest.clientId, clientRow.id)));
    requestId = own?.id ?? null;
  }

  const number = await nextTicketNumber();
  const now = new Date();

  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(ticket)
      .values({
        number,
        subject: input.subject.trim(),
        requesterName: clientRow.name,
        requesterEmail: clientRow.email,
        clientId: clientRow.id,
        priority: "normal",
        category: input.category || "general",
        requestId,
        status: "open",
        createdByUserId: user.id,
        lastReplyAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: ticket.id });

    await tx.insert(ticketMessage).values({
      ticketId: row.id,
      authorName: clientRow.name,
      authorRole: "client",
      body: input.message.trim(),
      createdAt: now,
    });

    return row.id;
  });

  // Send email to firm alerting them about the new ticket
  await sendTemplate(
    "notice",
    {
      subject: `[${number}] New support ticket: ${input.subject.trim()}`,
      heading: "New support ticket",
      paragraphs: [`**${clientRow.name}** (${clientRow.company || "no company"}) opened a ticket.`, input.message.trim()],
      rows: [
        { label: "Ticket", value: number },
        { label: "Subject", value: input.subject.trim() },
        { label: "Category", value: input.category || "general" },
      ],
      cta: { label: "View in Help Desk", href: "/admin/help-desk" },
      why: "You got this because a client opened a support ticket.",
    },
    { to: adminEmail, audience: "admin" },
  );

  await notifyFirm(input.requestId ?? null, {
    category: "support",
    title: `New support question from ${clientRow.company || clientRow.name}`,
    body: `${number} · ${input.subject.trim().slice(0, 150)}`,
    dedupeKey: `ticket-new:${id}`,
    adminLink: "/admin/help-desk",
    staffLink: input.requestId ? `/work/requests/${input.requestId}` : "/work/conversations",
  });

  revalidatePath("/dashboard/support");
  revalidatePath("/admin/help-desk");
  return { ok: true, id };
}

export async function replyClientTicketAction(ticketId: string, body: string): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user || user.role !== "client") return { ok: false, error: "Unauthorized" };

  if (!body.trim()) return { ok: false, error: "Message body cannot be empty." };

  const clientRow = await getClientForUser(user.id, user.email, user.name);

  // Check ownership
  const [t] = await db
    .select()
    .from(ticket)
    .where(and(eq(ticket.id, ticketId), eq(ticket.clientId, clientRow.id)))
    .limit(1);

  if (!t) return { ok: false, error: "Ticket not found." };

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(ticketMessage).values({
      ticketId,
      authorName: clientRow.name,
      authorRole: "client",
      body: body.trim(),
      createdAt: now,
    });

    await tx
      .update(ticket)
      .set({
        status: "open",
        lastReplyAt: now,
        updatedAt: now,
      })
      .where(eq(ticket.id, ticketId));
  });

  // Send email notify to firm
  await sendTemplate(
    "notice",
    {
      subject: `Re: [${t.number}] ${t.subject}`,
      heading: `New reply on ${t.number}`,
      paragraphs: [`**${clientRow.name}** replied on the support thread:`, body.trim()],
      cta: { label: "Reply in Help Desk", href: "/admin/help-desk" },
      why: "You got this because a client replied on a support ticket.",
    },
    { to: adminEmail, audience: "admin" },
  );

  await notifyFirm(t.requestId ?? null, {
    category: "support",
    title: `${clientRow.company || clientRow.name} replied on ${t.number}`,
    body: body.trim().slice(0, 200),
    dedupeKey: `ticket-reply:${ticketId}:${now.getTime()}`,
    adminLink: "/admin/help-desk",
    staffLink: t.requestId ? `/work/requests/${t.requestId}` : "/work/conversations",
  });

  revalidatePath(`/dashboard/support/${ticketId}`);
  revalidatePath("/dashboard/support");
  revalidatePath("/admin/help-desk");
  return { ok: true };
}
