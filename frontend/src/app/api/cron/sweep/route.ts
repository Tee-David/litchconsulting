import { NextResponse } from "next/server";
import { and, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  payment,
  serviceRequest,
  client,
  serviceRequestEvent,
  serviceRequestDocument,
  invoice,
  ticket,
} from "@/lib/db/schema";
import { sendTemplate } from "@/lib/email-templates";
import { notifyAdmin } from "@/lib/notify";
import { sweepRateLimits } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { eraseClientData, ERASURE_HOLD_DAYS } from "@/lib/privacy/erase";

export const dynamic = "force-dynamic";

/**
 * Daily housekeeping (Vercel Cron, see vercel.json):
 * 1. `initialized` Paystack rows older than 24h → `abandoned` (access codes
 *    expire; the request page always mints a fresh one on retry).
 * 2. `pending_payment` requests stalled >24h → one nudge email to the client
 *    (tracked by a `note` event so it never repeats).
 * 3. `quote_requested` older than 48h → admin reminder (their SLA is 2 days).
 * 4. Trash purge — rows soft-deleted more than 30 days ago are hard-deleted
 *    (except erased clients: their anonymous row anchors the kept finance records).
 * 5. NDPA erasures whose 30-day hold has passed are carried out.
 * 6. Uploads not yet virus-scanned are scanned (lib/uploads/scan.ts).
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
  const summary = { abandoned: 0, nudged: 0, quoteReminders: 0, purged: 0, erased: 0, erasureFailures: 0, scanned: { done: 0, infected: 0 }, rateLimitRows: 0 };

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
    await sendTemplate(
      "notice",
      {
        subject: `Your ${r.serviceName} request is waiting: ${r.number}`,
        heading: "Your request is one step away",
        name: c.name,
        paragraphs: [`Your **${r.serviceName}** request is saved and one payment away from starting. Pick up where you left off, or reply if something is holding you back.`],
        rows: [{ label: "Request", value: r.number }],
        cta: { label: "Complete your request", href: `${base}/dashboard/requests/${r.id}` },
        why: `You got this because your request ${r.number} is waiting for payment. We send this reminder once.`,
      },
      { to: c.email, audience: "client", dedupeKey: `payment-nudge:${r.id}` },
    ).catch(() => {});
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
      lines: ["These requests are past the 2-business-day quote promise:", owedQuotes.map((q) => `**${q.number}** · ${q.serviceName}`).join("\n")],
      href: `${base}/admin/requests?filter=action`,
    });
    summary.quoteReminders = owedQuotes.length;
  }

  // 4. Trash purge — anything soft-deleted >30 days ago is gone for good.
  const purgedClients = await db
    .delete(client)
    .where(and(isNotNull(client.deletedAt), lt(client.deletedAt, thirtyDaysAgo), isNull(client.erasedAt)))
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

  // 5. Erasures due (hold passed, not cancelled). One failure never blocks the rest.
  const holdCutoff = new Date(now - ERASURE_HOLD_DAYS * 24 * 60 * 60 * 1000);
  const due = await db
    .select()
    .from(client)
    .where(and(isNotNull(client.erasureRequestedAt), lt(client.erasureRequestedAt, holdCutoff), isNull(client.erasedAt)));
  for (const c of due) {
    try {
      const report = await eraseClientData(c);
      await recordAudit({
        action: "client.erased",
        entity: "client",
        entityId: c.id,
        actorName: "Scheduled erasure",
        meta: { client: c.company || c.name, scheduledBy: c.erasureRequestedBy, ...report },
      });
      summary.erased++;
    } catch (e) {
      console.error("[sweep] erasure failed", c.id, e);
      summary.erasureFailures++;
    }
  }
  if (summary.erasureFailures) {
    await notifyAdmin({
      subject: `${summary.erasureFailures} scheduled erasure${summary.erasureFailures > 1 ? "s" : ""} failed`,
      lines: ["The nightly sweep could not finish a scheduled client erasure. It retries tomorrow; check the client's Privacy tab and the audit log."],
    }).catch(() => {});
  }

  // 6. Virus-scan uploads nobody has opened yet (they are scanned on first open
  //    too). Bounded so the cron stays inside its time budget.
  const { scannerConfigured, ensureDocumentScanned, ensureProofScanned } = await import("@/lib/uploads/scan");
  if (scannerConfigured()) {
    const docs = await db
      .select({ id: serviceRequestDocument.id, requestId: serviceRequestDocument.requestId, r2Key: serviceRequestDocument.r2Key, fileName: serviceRequestDocument.fileName, scanStatus: serviceRequestDocument.scanStatus })
      .from(serviceRequestDocument)
      .where(inArray(serviceRequestDocument.scanStatus, ["unscanned", "error"]))
      .limit(25);
    for (const d of docs) summary.scanned[(await ensureDocumentScanned(d)) === "infected" ? "infected" : "done"]++;
    const proofs = await db
      .select({ id: payment.id, proofKey: payment.proofKey, proofFileName: payment.proofFileName, proofScanStatus: payment.proofScanStatus })
      .from(payment)
      .where(and(isNotNull(payment.proofKey), inArray(payment.proofScanStatus, ["unscanned", "error"])))
      .limit(10);
    for (const p of proofs) {
      if (!p.proofKey) continue;
      summary.scanned[(await ensureProofScanned({ ...p, proofKey: p.proofKey })) === "infected" ? "infected" : "done"]++;
    }
  }

  // 7. Expired rate-limit windows.
  summary.rateLimitRows = await sweepRateLimits().catch(() => 0);

  return NextResponse.json({ ok: true, ...summary });
}
