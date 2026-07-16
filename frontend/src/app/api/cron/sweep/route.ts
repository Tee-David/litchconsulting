import { NextResponse } from "next/server";
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  payment,
  serviceRequest,
  client,
  serviceRequestEvent,
  invoice,
  ticket,
} from "@/lib/db/schema";
import { sendEmail, emailLayout } from "@/lib/email";
import { notifyAdmin } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * Daily housekeeping (Vercel Cron, see vercel.json):
 * 1. `initialized` Paystack rows older than 24h → `abandoned` (access codes
 *    expire; the request page always mints a fresh one on retry).
 * 2. `pending_payment` requests stalled >24h → one nudge email to the client
 *    (tracked by a `note` event so it never repeats).
 * 3. `quote_requested` older than 48h → admin reminder (their SLA is 2 days).
 * 4. Trash purge — rows soft-deleted more than 30 days ago are hard-deleted.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now - 48 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const summary = { abandoned: 0, nudged: 0, quoteReminders: 0, purged: 0 };

  // 1. Stale checkout attempts.
  const stale = await db
    .update(payment)
    .set({ status: "abandoned", updatedAt: new Date() })
    .where(and(eq(payment.status, "initialized"), lt(payment.createdAt, dayAgo)))
    .returning({ id: payment.id });
  summary.abandoned = stale.length;

  // 2. Unpaid requests — one nudge each.
  const pending = await db
    .select()
    .from(serviceRequest)
    .where(
      and(eq(serviceRequest.status, "pending_payment"), lt(serviceRequest.updatedAt, dayAgo))
    );
  for (const r of pending) {
    const alreadyNudged = await db
      .select({ id: serviceRequestEvent.id })
      .from(serviceRequestEvent)
      .where(
        and(
          eq(serviceRequestEvent.requestId, r.id),
          eq(serviceRequestEvent.type, "note"),
          eq(serviceRequestEvent.actorName, "payment-nudge")
        )
      )
      .limit(1);
    if (alreadyNudged.length) continue;

    const [c] = await db.select().from(client).where(eq(client.id, r.clientId));
    if (!c?.email) continue;
    const base = (process.env.BETTER_AUTH_URL || "https://litchconsulting.com").replace(/\/$/, "");
    await sendEmail({
      to: c.email,
      subject: `Still interested? Your ${r.serviceName} request is waiting — ${r.number}`,
      html: emailLayout(`
        <p style="margin:0 0 14px;">Hi ${c.name || "there"},</p>
        <p style="margin:0 0 18px;">Your <strong>${r.serviceName}</strong> request is saved and one payment away from kicking off. Pick up where you left off any time — or reply if something's holding you back.</p>
        <p style="margin:0 0 20px;"><a href="${base}/dashboard/requests/${r.id}" style="display:inline-block;background:#0a196d;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:9999px;">Complete your request</a></p>
      `),
    }).catch(() => {});
    await db.insert(serviceRequestEvent).values({
      requestId: r.id,
      type: "note",
      message: "Payment reminder emailed.",
      visibility: "internal",
      actorRole: "system",
      actorName: "payment-nudge",
    });
    summary.nudged++;
  }

  // 3. Quotes we owe.
  const owedQuotes = await db
    .select({ id: serviceRequest.id, number: serviceRequest.number, serviceName: serviceRequest.serviceName })
    .from(serviceRequest)
    .where(
      and(
        eq(serviceRequest.status, "quote_requested"),
        lt(serviceRequest.createdAt, twoDaysAgo)
      )
    );
  if (owedQuotes.length) {
    const base = (process.env.BETTER_AUTH_URL || "https://litchconsulting.com").replace(/\/$/, "");
    await notifyAdmin({
      subject: `${owedQuotes.length} quote${owedQuotes.length > 1 ? "s" : ""} overdue (>48h)`,
      html: `<p>These requests are past the 2-business-day quote promise:</p><ul>${owedQuotes
        .map((q) => `<li><strong>${q.number}</strong> — ${q.serviceName}</li>`)
        .join("")}</ul>`,
      href: `${base}/admin/requests?filter=action`,
    });
    summary.quoteReminders = owedQuotes.length;
  }

  // 4. Trash purge — anything soft-deleted >30 days ago is gone for good.
  const purgedClients = await db
    .delete(client)
    .where(and(isNotNull(client.deletedAt), lt(client.deletedAt, thirtyDaysAgo)))
    .returning({ id: client.id });
  const purgedInvoices = await db
    .delete(invoice)
    .where(and(isNotNull(invoice.deletedAt), lt(invoice.deletedAt, thirtyDaysAgo)))
    .returning({ id: invoice.id });
  const purgedTickets = await db
    .delete(ticket)
    .where(and(isNotNull(ticket.deletedAt), lt(ticket.deletedAt, thirtyDaysAgo)))
    .returning({ id: ticket.id });
  const purgedRequests = await db
    .delete(serviceRequest)
    .where(and(isNotNull(serviceRequest.deletedAt), lt(serviceRequest.deletedAt, thirtyDaysAgo)))
    .returning({ id: serviceRequest.id });
  summary.purged =
    purgedClients.length + purgedInvoices.length + purgedTickets.length + purgedRequests.length;

  return NextResponse.json({ ok: true, ...summary });
}
