import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Badge } from "@/components/admin/ui/badge";
import { formatMoney, num } from "@/lib/invoice/money";
import { formatDateTime } from "@/lib/format-date";
import type { Payment } from "@/lib/db/schema";

/** Recent Paystack activity — flagged rows first-class (they need action). */
export function PaymentsFeed({
  rows,
}: {
  rows: { payment: Payment; invoiceNumber: string }[];
}) {
  return (
    <div data-tour="recent-activity" className="rounded-card border border-hairline bg-paper">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <h3 className="font-display text-sm font-bold text-ink">Payment activity</h3>
        <CreditCard className="size-4 text-muted" />
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-body">
          No online payments yet — they land here the moment Paystack confirms.
        </p>
      ) : (
        <div className="divide-y divide-hairline">
          {rows.map(({ payment: p, invoiceNumber }) => {
            const flagged =
              p.status === "flagged_amount_mismatch" || p.status === "duplicate_success";
            return (
              <Link
                key={p.id}
                href={`/admin/finance/invoices/${p.invoiceId}`}
                className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{invoiceNumber}</p>
                  <p className="truncate text-xs text-muted">
                    {p.reference} · {formatDateTime(p.updatedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-ink">
                    {formatMoney(num(p.amountSettled ?? p.amount), p.currency)}
                  </span>
                  <Badge
                    tone={p.status === "success" ? "success" : flagged ? "warning" : "neutral"}
                  >
                    {p.status.replace(/_/g, " ")}
                  </Badge>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
