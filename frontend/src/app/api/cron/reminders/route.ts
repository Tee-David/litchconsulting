import { NextResponse } from "next/server";
import { and, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoice } from "@/lib/db/schema";
import { auditForEntity } from "@/lib/db/queries/audit";
import { recordAudit } from "@/lib/audit";
import { sendEmail, emailLayout, emailButton, emailDetailRows, EMAIL_ICONS } from "@/lib/email";
import { formatMoney, num } from "@/lib/invoice/money";

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
 * PAYMENT REMINDERS (Vercel Cron, daily — see vercel.json).
 *
 * Nudges clients about invoices that are nearly due or already late. Each
 * invoice gets at most ONE email per stage: the send is recorded in audit_log
 * as `invoice.reminder_sent` with the stage, and a stage that's already logged
 * is skipped — so a re-run (or a retry) can never spam a client.
 */

type Stage = { key: string; offset: number; label: string };

/** offset = days relative to the due date (negative = before). */
const STAGES: Stage[] = [
  { key: "due-3", offset: -3, label: "due in 3 days" },
  { key: "due-0", offset: 0, label: "due today" },
  { key: "overdue-3", offset: 3, label: "3 days overdue" },
  { key: "overdue-7", offset: 7, label: "7 days overdue" },
];

/** Whole days from the due date to today (positive = overdue). */
function daysPastDue(dueDate: string, today: Date): number {
  const due = new Date(`${dueDate}T00:00:00Z`);
  const now = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return Math.round((now.getTime() - due.getTime()) / 86_400_000);
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const rows = await db
    .select()
    .from(invoice)
    .where(
      and(
        eq(invoice.kind, "invoice"),
        inArray(invoice.status, ["sent", "overdue"]),
        isNotNull(invoice.dueDate),
        isNull(invoice.deletedAt),
      ),
    );

  let sent = 0;
  let markedOverdue = 0;

  for (const inv of rows) {
    if (!inv.dueDate || !inv.billToEmail) continue;

    const past = daysPastDue(inv.dueDate, today);

    // Keep the status honest while we're here: a sent invoice past its due date
    // is overdue, which is what the dashboards and this reminder both read.
    if (past > 0 && inv.status === "sent") {
      await db
        .update(invoice)
        .set({ status: "overdue", updatedAt: new Date() })
        .where(eq(invoice.id, inv.id));
      markedOverdue += 1;
    }

    const stage = STAGES.find((s) => s.offset === past);
    if (!stage) continue;

    // One email per stage, ever.
    const trail = await auditForEntity("invoice", inv.id, 100);
    const already = trail.some(
      (a) => a.action === "invoice.reminder_sent" && (a.meta as { stage?: string } | null)?.stage === stage.key,
    );
    if (already) continue;

    const outstanding = Math.max(0, num(inv.total) - num(inv.amountPaid));
    if (outstanding <= 0) continue;

    const payUrl = inv.publicToken ? `${baseUrl()}/i/${inv.publicToken}` : `${baseUrl()}/dashboard/invoices`;
    const late = past > 0;

    try {
      await sendEmail({
        to: inv.billToEmail,
        subject: late
          ? `Reminder: invoice ${inv.number} is ${stage.label}`
          : `Invoice ${inv.number} is ${stage.label}`,
        html: emailLayout(
          `
          <p style="margin:0 0 6px;font-size:20px;font-weight:700;">${late ? "A gentle reminder" : "Payment due soon"}</p>
          <p class="body" style="margin:0 0 18px;color:#41485a;">Hi ${inv.billToName || "there"}, invoice <strong>${inv.number}</strong> is ${stage.label}. ${
            late ? "If you've already sent it across, thank you — please ignore this note." : "Here are the details."
          }</p>
          ${emailDetailRows([
            { label: "Invoice", value: inv.number },
            ...(inv.projectTitle ? [{ label: "Project", value: inv.projectTitle }] : []),
            { label: "Due", value: inv.dueDate },
            { label: "Amount outstanding", value: formatMoney(outstanding, inv.currency), strong: true },
          ])}
          <p style="margin:18px 0 12px;">${emailButton(payUrl, "View & pay invoice", EMAIL_ICONS.arrow)}</p>
        `,
          { preheader: `Invoice ${inv.number} is ${stage.label} — ${formatMoney(outstanding, inv.currency)} outstanding.` },
        ),
      });

      await recordAudit({
        actorName: "System",
        action: "invoice.reminder_sent",
        entity: "invoice",
        entityId: inv.id,
        meta: { stage: stage.key, number: inv.number, outstanding, currency: inv.currency },
      });
      sent += 1;
    } catch (err) {
      console.error(`[cron/reminders] ${inv.number} failed:`, err);
    }
  }

  return NextResponse.json({ ok: true, scanned: rows.length, sent, markedOverdue });
}
