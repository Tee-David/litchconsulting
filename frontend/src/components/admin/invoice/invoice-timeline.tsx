import {
  FilePlus2,
  Send,
  Banknote,
  Ban,
  RefreshCcw,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { paymentsForInvoice } from "@/lib/db/queries/payments";
import { auditForEntity } from "@/lib/db/queries/audit";
import { formatMoney, num } from "@/lib/invoice/money";
import { formatDateTime } from "@/lib/format-date";
import type { Invoice } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

type Entry = {
  at: Date;
  icon: LucideIcon;
  tint: string;
  title: string;
  detail?: string;
  actor?: string | null;
};

/** How an audit action reads in the activity feed. Anything not listed is
 *  skipped — the timeline is a story, not a raw log dump (that's /admin/audit). */
const AUDIT_ENTRIES: Record<string, { icon: LucideIcon; tint: string; title: string }> = {
  "payment.recorded_manual": { icon: Banknote, tint: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400", title: "Payment confirmed manually" },
  "payment.removed_manual": { icon: Undo2, tint: "bg-amber-500/12 text-amber-600 dark:text-amber-400", title: "Recorded payment removed" },
  "invoice.status_changed": { icon: RefreshCcw, tint: "bg-blue-500/12 text-blue-600 dark:text-blue-400", title: "Status changed" },
  "invoice.void": { icon: Ban, tint: "bg-red-500/12 text-red-600 dark:text-red-400", title: "Invoice voided" },
};

/**
 * Invoice Activity — created → sent → payments, plus the manual corrections an
 * admin made. Composed from the invoice's own timestamps, the payment ledger
 * and the audit trail, because no single table tells the whole story.
 */
export async function InvoiceTimeline({ invoice: inv }: { invoice: Invoice }) {
  const [payments, audit] = await Promise.all([
    paymentsForInvoice(inv.id),
    auditForEntity("invoice", inv.id),
  ]);

  const entries: Entry[] = [
    {
      at: inv.createdAt,
      icon: FilePlus2,
      tint: "bg-brand-tint text-brand",
      title: `${inv.kind === "quote" ? "Quote" : "Invoice"} created`,
      detail: inv.number,
    },
  ];

  if (inv.sentAt) {
    entries.push({
      at: inv.sentAt,
      icon: Send,
      tint: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
      title: "Sent to client",
      detail: inv.billToEmail || undefined,
    });
  }

  for (const p of payments) {
    const amt = num(p.amountSettled ?? p.amount);
    const ok = p.status === "success";
    entries.push({
      at: p.paidAt ?? p.createdAt,
      icon: Banknote,
      tint: ok
        ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
        : "bg-amber-500/12 text-amber-600 dark:text-amber-400",
      title: ok ? "Payment received" : `Payment ${p.status.replace(/_/g, " ")}`,
      detail: `${formatMoney(amt, inv.currency)} · ${(p.channel || p.provider).replace(/_/g, " ")}`,
    });
  }

  // Audit rows add the human actions (manual confirms, voids, status flips).
  // payment.applied is skipped — the payment row above already tells that story.
  for (const a of audit) {
    const spec = AUDIT_ENTRIES[a.action];
    if (!spec) continue;
    const meta = (a.meta ?? {}) as Record<string, unknown>;
    const amount = typeof meta.amount === "number" ? meta.amount : undefined;
    const status = typeof meta.status === "string" ? meta.status : undefined;
    entries.push({
      at: a.createdAt,
      icon: spec.icon,
      tint: spec.tint,
      title: spec.title,
      detail: amount != null ? formatMoney(amount, inv.currency) : status,
      actor: a.actorName,
    });
  }

  entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="rounded-card border border-hairline bg-paper p-5">
      <h3 className="font-display text-sm font-bold text-ink">Activity</h3>
      <ol className="mt-4 space-y-4">
        {entries.map((e, i) => (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", e.tint)}>
                <e.icon className="size-4" />
              </span>
              {i < entries.length - 1 && <span className="mt-1 w-px flex-1 bg-hairline" />}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <p className="text-sm font-medium text-ink">{e.title}</p>
              {e.detail && <p className="truncate text-xs text-body">{e.detail}</p>}
              <p className="mt-0.5 text-[11px] text-muted">
                {formatDateTime(e.at)}
                {e.actor ? ` · ${e.actor}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
