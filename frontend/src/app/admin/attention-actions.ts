"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { emailOutbox, invoice, requestAssignment, requestItem, serviceRequest, serviceRequestEvent } from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { notifyUsers } from "@/lib/notifications";
import { formatMoney, num } from "@/lib/invoice/money";
import { actor, DENIED, failure } from "./_lib/guard";
import { simpleEmail, escapeHtml } from "./_lib/mail";

type Res = { ok: true; undoId?: string; message?: string } | { ok: false; error: string };

const itemId = z.string().regex(/^[a-z]+:[0-9a-f-]{36}$/i);
function parse(id: string, kind: string): string | null {
  if (!itemId.safeParse(id).success) return null;
  const [k, rowId] = id.split(":");
  return k === kind ? rowId : null;
}
const ymd = () => new Date().toISOString().slice(0, 10);

function done(paths: string[] = []) {
  revalidatePath("/admin");
  for (const p of paths) revalidatePath(p);
}

/** Overdue invoice → reminder email to the bill-to address (once per day per invoice). */
export async function remindInvoice(id: string): Promise<Res> {
  const me = await actor("billing");
  if (!me) return DENIED;
  const invId = parse(id, "overdue");
  if (!invId) return { ok: false, error: "That item is no longer valid. Refresh the page." };
  try {
    const [inv] = await db.select().from(invoice).where(eq(invoice.id, invId)).limit(1);
    if (!inv || inv.deletedAt) return { ok: false, error: "This invoice no longer exists." };
    if (!inv.billToEmail) return { ok: false, error: "The invoice has no email address. Add one first." };
    if (["paid", "void"].includes(inv.status)) return { ok: false, error: `${inv.number} is already ${inv.status}.` };
    const bal = num(inv.total) - num(inv.amountPaid);
    const res = await sendEmail({
      to: inv.billToEmail,
      subject: `Reminder: ${inv.number}, ${formatMoney(bal, inv.currency)} is overdue`,
      dedupeKey: `invoice-reminder:${inv.id}:${ymd()}`,
      html: simpleEmail({
        heading: `Invoice ${inv.number} is past its due date`,
        greeting: inv.billToName,
        paragraphs: [
          `This is a reminder that <strong>${escapeHtml(formatMoney(bal, inv.currency))}</strong> on invoice ${escapeHtml(inv.number)} was due on ${escapeHtml(String(inv.dueDate))}.`,
          "If you have already paid, thank you, and please reply with the transfer reference so we can match it. If you deducted WHT, send us the credit note.",
        ],
        rows: [
          { label: "Invoice", value: inv.number },
          { label: "Due", value: String(inv.dueDate) },
          { label: "Balance", value: formatMoney(bal, inv.currency), strong: true },
        ],
        cta: { href: `/i/${inv.publicToken}`, label: "View and pay" },
        why: "You got this because an invoice addressed to you is past its due date. Payment emails always send.",
        preheader: `${formatMoney(bal, inv.currency)} on ${inv.number} is overdue`,
      }),
    });
    if (res.duplicate) return { ok: true, message: `A reminder for ${inv.number} already went out today.` };
    if (inv.status !== "overdue" && inv.status !== "partially_paid") {
      await db.update(invoice).set({ status: "overdue", updatedAt: new Date() }).where(eq(invoice.id, inv.id));
    }
    await recordAudit({ action: "invoice.reminder_sent", entity: "invoice", entityId: inv.id, meta: { number: inv.number, balance: bal } });
    done(["/admin/billing"]);
    return { ok: true, message: res.delivered ? `Reminder sent to ${inv.billToEmail}.` : "Reminder queued. Email is not configured on this deployment." };
  } catch (e) {
    return failure(e, "The reminder did not send. Try again.");
  }
}

/** Quote with no answer → follow-up email with the accept link. */
export async function followUpQuote(id: string): Promise<Res> {
  const me = await actor("billing");
  if (!me) return DENIED;
  const qId = parse(id, "quote");
  if (!qId) return { ok: false, error: "That item is no longer valid. Refresh the page." };
  try {
    const [q] = await db.select().from(invoice).where(eq(invoice.id, qId)).limit(1);
    if (!q || q.deletedAt || q.kind !== "quote") return { ok: false, error: "This quote no longer exists." };
    if (q.status !== "sent") return { ok: false, error: `${q.number} is ${q.status} now.` };
    if (!q.billToEmail) return { ok: false, error: "The quote has no email address." };
    const res = await sendEmail({
      to: q.billToEmail,
      subject: `Your quote ${q.number}: any questions?`,
      dedupeKey: `quote-followup:${q.id}:${ymd()}`,
      html: simpleEmail({
        heading: `Following up on quote ${q.number}`,
        greeting: q.billToName,
        paragraphs: [
          `We sent you a quote${q.projectTitle ? ` for <strong>${escapeHtml(q.projectTitle)}</strong>` : ""}. If it looks right, you can accept it online in one click; your invoice and pay link follow straight away.`,
          "If something needs changing, reply to this email and we will update it.",
        ],
        rows: [
          { label: "Quote", value: q.number },
          { label: "Total", value: formatMoney(num(q.total), q.currency), strong: true },
          ...(q.dueDate ? [{ label: "Valid to", value: String(q.dueDate) }] : []),
        ],
        cta: { href: `/i/${q.publicToken}`, label: "Review the quote" },
        why: "You got this because you asked Litch Consulting for a quote.",
      }),
    });
    if (res.duplicate) return { ok: true, message: `You already followed up on ${q.number} today.` };
    await recordAudit({ action: "quote.follow_up_sent", entity: "invoice", entityId: q.id, meta: { number: q.number } });
    done(["/admin/billing"]);
    return { ok: true, message: `Follow-up sent to ${q.billToEmail}.` };
  } catch (e) {
    return failure(e, "The follow-up did not send. Try again.");
  }
}

/** Draft with the client for days → nudge them (bell + email). */
export async function remindReview(id: string): Promise<Res> {
  const me = await actor("requests");
  if (!me) return DENIED;
  const reqId = parse(id, "clientreview");
  if (!reqId) return { ok: false, error: "That item is no longer valid. Refresh the page." };
  try {
    const [r] = await db.select().from(serviceRequest).where(eq(serviceRequest.id, reqId)).limit(1);
    if (!r || r.deletedAt) return { ok: false, error: "This request no longer exists." };
    if (r.status !== "client_review") return { ok: false, error: `${r.number} is no longer waiting on the client.` };
    const link = `/dashboard/requests/${r.id}`;
    await notifyUsers({
      userIds: [r.userId],
      category: "actions",
      title: `Your draft for ${r.serviceName} is waiting for your review`,
      body: `Round ${Math.max(1, r.reviewRound)}. Approve it, or tell us what to change.`,
      link,
      dedupeKey: `review-nudge:${r.id}:${r.reviewRound}:${ymd()}`,
      email: {
        subject: `Reminder: your draft is ready to review (${r.number})`,
        html: simpleEmail({
          heading: "Your draft is waiting for you",
          paragraphs: [`The draft for <strong>${escapeHtml(r.serviceName)}</strong> is ready. Approve it, or tell us what to change, and we will carry on.`],
          rows: [{ label: "Request", value: r.number }, { label: "Round", value: String(Math.max(1, r.reviewRound)) }],
          cta: { href: link, label: "Review the draft" },
          why: "You got this because a draft on your request is waiting for your approval.",
        }),
      },
    });
    await db.insert(serviceRequestEvent).values({
      requestId: r.id,
      type: "note",
      message: "Reminder sent to review the draft.",
      visibility: "internal",
      actorRole: "admin",
      actorName: me.displayName,
    });
    done([`/admin/requests/${r.id}`]);
    return { ok: true, message: "Reminder sent to the client." };
  } catch (e) {
    return failure(e);
  }
}

/** Unassigned request → assign to me (Undo removes the assignment). */
export async function assignMe(id: string): Promise<Res> {
  const me = await actor("requestsAll");
  if (!me) return DENIED;
  const reqId = parse(id, "assign");
  if (!reqId) return { ok: false, error: "That item is no longer valid. Refresh the page." };
  try {
    const [r] = await db.select().from(serviceRequest).where(eq(serviceRequest.id, reqId)).limit(1);
    if (!r || r.deletedAt) return { ok: false, error: "This request no longer exists." };
    const [row] = await db
      .insert(requestAssignment)
      .values({ requestId: r.id, userId: me.id, assignedBy: me.id })
      .onConflictDoNothing()
      .returning({ id: requestAssignment.id });
    await db.update(serviceRequest).set({ assignee: me.displayName, updatedAt: new Date() }).where(eq(serviceRequest.id, r.id));
    await recordAudit({ action: "request.assigned", entity: "request", entityId: r.id, meta: { number: r.number, to: me.displayName } });
    done([`/admin/requests/${r.id}`, "/admin/requests"]);
    return { ok: true, message: `${r.number} is assigned to you.`, undoId: row ? `unassign:${row.id}` : undefined };
  } catch (e) {
    return failure(e);
  }
}

/** Supplied ask → received (client sees it ticked). Undo puts it back to supplied. */
export async function markReceived(id: string): Promise<Res> {
  const me = await actor("requests");
  if (!me) return DENIED;
  const iId = parse(id, "item");
  if (!iId) return { ok: false, error: "That item is no longer valid. Refresh the page." };
  try {
    const [it] = await db.select().from(requestItem).where(eq(requestItem.id, iId)).limit(1);
    if (!it) return { ok: false, error: "This ask no longer exists." };
    if (it.status !== "supplied") return { ok: false, error: `This ask is ${it.status} now.` };
    await db.update(requestItem).set({ status: "received", receivedAt: new Date(), updatedAt: new Date() }).where(eq(requestItem.id, it.id));
    await db.insert(serviceRequestEvent).values({
      requestId: it.requestId,
      type: "note",
      message: `Received: ${it.title}`,
      visibility: "client",
      actorRole: "admin",
      actorName: me.displayName,
    });
    done([`/admin/requests/${it.requestId}`, `/dashboard/requests/${it.requestId}`]);
    return { ok: true, message: `Marked received. The client sees “${it.title}” ticked.`, undoId: `unreceive:${it.id}` };
  } catch (e) {
    return failure(e);
  }
}

/** Failed outbox row → resend it with its original event key. */
export async function retryEmail(id: string): Promise<Res> {
  const me = await actor("settings");
  if (!me) return DENIED;
  const mId = parse(id, "mail");
  if (!mId) return { ok: false, error: "That item is no longer valid. Refresh the page." };
  try {
    const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, mId)).limit(1);
    if (!row) return { ok: false, error: "That email is no longer in the outbox." };
    if (row.status === "sent") return { ok: true, message: "That email has already been sent." };
    if (!row.retryable || !row.payload) return { ok: false, error: "This email had an attachment, so it cannot be replayed. Send it again from its invoice or receipt." };
    const p = row.payload as { to: string | string[]; subject: string; html?: string; text?: string; replyTo?: string };
    try {
      const r = await sendEmail({ ...p, dedupeKey: row.dedupeKey });
      if (!r.delivered && !r.duplicate) return { ok: false, error: "Email is not configured on this deployment, so it cannot be sent." };
    } catch (e) {
      return { ok: false, error: `It failed again: ${e instanceof Error ? e.message.slice(0, 120) : "mail server error"}.` };
    }
    await recordAudit({ action: "email.retried", entity: "email", entityId: row.id, meta: { subject: row.subject, to: row.to } });
    done();
    return { ok: true, message: `Sent “${row.subject}” to ${row.to}.` };
  } catch (e) {
    return failure(e);
  }
}

/** Failed email nobody needs → dismiss (status skipped). Undo restores it. */
export async function dismissEmail(id: string): Promise<Res> {
  const me = await actor("settings");
  if (!me) return DENIED;
  const mId = parse(id, "mail");
  if (!mId) return { ok: false, error: "That item is no longer valid. Refresh the page." };
  try {
    await db
      .update(emailOutbox)
      .set({ status: "skipped", updatedAt: new Date() })
      .where(and(eq(emailOutbox.id, mId), eq(emailOutbox.status, "failed")));
    done();
    return { ok: true, message: "Dismissed.", undoId: `undismiss:${mId}` };
  } catch (e) {
    return failure(e);
  }
}

/** One Undo for every reversible attention action. */
export async function undoAttention(undoId: string): Promise<Res> {
  const [kind, rowId] = undoId.split(":");
  if (!rowId || !/^[0-9a-f-]{36}$/i.test(rowId)) return { ok: false, error: "Nothing to undo." };
  try {
    if (kind === "unassign") {
      const me = await actor("requestsAll");
      if (!me) return DENIED;
      const [a] = await db.delete(requestAssignment).where(eq(requestAssignment.id, rowId)).returning();
      if (a) {
        const [left] = await db.select().from(requestAssignment).where(eq(requestAssignment.requestId, a.requestId)).limit(1);
        if (!left) await db.update(serviceRequest).set({ assignee: null }).where(eq(serviceRequest.id, a.requestId));
        await recordAudit({ action: "request.unassigned", entity: "request", entityId: a.requestId, meta: { undo: true } });
      }
    } else if (kind === "unreceive") {
      const me = await actor("requests");
      if (!me) return DENIED;
      await db
        .update(requestItem)
        .set({ status: "supplied", receivedAt: null, updatedAt: new Date() })
        .where(and(eq(requestItem.id, rowId), eq(requestItem.status, "received")));
    } else if (kind === "undismiss") {
      const me = await actor("settings");
      if (!me) return DENIED;
      await db.update(emailOutbox).set({ status: "failed" }).where(and(eq(emailOutbox.id, rowId), eq(emailOutbox.status, "skipped")));
    } else return { ok: false, error: "Nothing to undo." };
    done(["/admin/requests"]);
    return { ok: true, message: "Undone." };
  } catch (e) {
    return failure(e);
  }
}
