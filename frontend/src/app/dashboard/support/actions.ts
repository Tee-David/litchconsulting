"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { ticket, ticketMessage } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/server-user";
import { getClientForUser } from "@/lib/db/queries/clients";
import { nextTicketNumber } from "@/lib/db/queries/tickets";
import { sendEmail, emailLayout } from "@/lib/email";

type ActionResult = { ok: boolean; id?: string; error?: string };

const adminEmail = process.env.SMTP_USER || "info@litchconsulting.com";

export async function createClientTicketAction(input: {
  subject: string;
  category: string;
  message: string;
}): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user || user.role !== "client") return { ok: false, error: "Unauthorized" };

  if (!input.subject.trim()) return { ok: false, error: "Subject is required." };
  if (!input.message.trim()) return { ok: false, error: "Initial message is required." };

  const clientRow = await getClientForUser(user.id, user.email, user.name);
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
  const html = emailLayout(`
    <p style="margin:0 0 14px;"><strong>New Support Ticket Created</strong></p>
    <p style="margin:0 0 14px;">A new support ticket has been opened by <strong>${clientRow.name}</strong> (${clientRow.company || "No Company"}).</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
      <tr>
        <td style="padding:6px 0;font-weight:600;width:100px;">Ticket No:</td>
        <td style="padding:6px 0;">${number}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-weight:600;">Subject:</td>
        <td style="padding:6px 0;">${input.subject.trim()}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-weight:600;">Category:</td>
        <td style="padding:6px 0;text-transform:capitalize;">${input.category}</td>
      </tr>
    </table>
    <div style="background:#f5f6fa;padding:14px;border-radius:8px;border:1px solid #e6e8f0;font-style:italic;">
      "${input.message.trim()}"
    </div>
    <p style="margin:20px 0 0;"><a href="${process.env.BETTER_AUTH_URL || "https://litchconsulting.com"}/admin/help-desk" style="display:inline-block;background:#0a196d;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:9999px;">View in Help Desk</a></p>
  `);

  await sendEmail({
    to: adminEmail,
    subject: `[${number}] New Support Ticket: ${input.subject.trim()}`,
    html,
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
  const html = emailLayout(`
    <p style="margin:0 0 14px;"><strong>New Reply on Ticket ${t.number}</strong></p>
    <p style="margin:0 0 14px;"><strong>${clientRow.name}</strong> has replied to the support thread:</p>
    <div style="background:#f5f6fa;padding:14px;border-radius:8px;border:1px solid #e6e8f0;font-style:italic;margin-bottom:20px;">
      "${body.trim()}"
    </div>
    <p style="margin:0;"><a href="${process.env.BETTER_AUTH_URL || "https://litchconsulting.com"}/admin/help-desk" style="display:inline-block;background:#0a196d;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:9999px;">Reply in Help Desk</a></p>
  `);

  await sendEmail({
    to: adminEmail,
    subject: `Re: [${t.number}] ${t.subject}`,
    html,
  });

  revalidatePath(`/dashboard/support/${ticketId}`);
  revalidatePath("/dashboard/support");
  revalidatePath("/admin/help-desk");
  return { ok: true };
}
