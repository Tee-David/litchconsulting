import { NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { client, invoice, serviceRequest } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { buildClientDigestEmail, type DigestRequest } from "@/lib/emails/digest";
import { ACTIVE_STATUSES } from "@/lib/requests/status";
import { num } from "@/lib/invoice/money";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function baseUrl() {
  return (
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://litchconsulting.com"
  ).replace(/\/$/, "");
}

/**
 * WEEKLY CLIENT DIGEST (Vercel Cron, weekly — see vercel.json).
 * For every live client with an email who hasn't opted out, send a short
 * branded summary: active requests, amounts due, deliverables ready. Clients
 * with nothing to report are skipped so the digest never becomes noise.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const clients = await db
    .select()
    .from(client)
    .where(and(isNull(client.deletedAt), eq(client.digestOptOut, false)));

  const summary = { candidates: clients.length, sent: 0, skipped: 0 };
  const base = baseUrl();

  for (const c of clients) {
    if (!c.email) {
      summary.skipped++;
      continue;
    }

    const requests = await db
      .select({
        number: serviceRequest.number,
        serviceName: serviceRequest.serviceName,
        status: serviceRequest.status,
      })
      .from(serviceRequest)
      .where(and(eq(serviceRequest.clientId, c.id), isNull(serviceRequest.deletedAt)));

    const activeRequests: DigestRequest[] = requests.filter((r) =>
      (ACTIVE_STATUSES as string[]).includes(r.status),
    );
    const deliverablesReady = requests.filter((r) => r.status === "delivered").length;

    const openInvoices = await db
      .select({ total: invoice.total, amountPaid: invoice.amountPaid, currency: invoice.currency })
      .from(invoice)
      .where(
        and(
          eq(invoice.clientId, c.id),
          isNull(invoice.deletedAt),
          inArray(invoice.status, ["sent", "overdue"]),
        ),
      );

    const amountDue = openInvoices.reduce((s, inv) => s + (num(inv.total) - num(inv.amountPaid)), 0);
    const currency = openInvoices[0]?.currency || "NGN";

    // Nothing worth emailing about this week.
    if (activeRequests.length === 0 && amountDue <= 0 && deliverablesReady === 0) {
      summary.skipped++;
      continue;
    }

    const { subject, html } = buildClientDigestEmail({
      clientName: c.name,
      activeRequests,
      amountDue,
      currency,
      deliverablesReady,
      baseUrl: base,
    });

    try {
      await sendEmail({ to: c.email, subject, html });
      summary.sent++;
    } catch (err) {
      console.error("[digest] send failed for", c.id, err);
      summary.skipped++;
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}
