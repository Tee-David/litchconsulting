import { formatMoney } from "@/lib/invoice/money";
import { formatDate } from "@/lib/format-date";
import type { AgingBuckets } from "@/lib/invoice/aging";

/** Accounts-receivable aging: who owes what, and for how long. */
export function ArAgingCard({ aging }: { aging: AgingBuckets }) {
  const max = Math.max(1, ...aging.buckets.map((b) => b.amount));
  return (
    <div data-tour="ar-aging" className="rounded-card border border-hairline bg-paper p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold text-ink">Receivables aging</h3>
        <span className="font-display text-sm font-bold text-ink">
          {formatMoney(aging.totalOutstanding)}
        </span>
      </div>
      {aging.totalOutstanding === 0 ? (
        <p className="mt-3 text-sm text-body">Nothing outstanding — all invoices settled.</p>
      ) : (
        <>
          <div className="mt-4 space-y-2.5">
            {aging.buckets.map((b, i) => (
              <div key={b.label}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-body">{b.label}</span>
                  <span className="font-semibold tabular-nums text-ink">
                    {b.amount > 0 ? formatMoney(b.amount) : "—"}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface">
                  <div
                    className={
                      "h-full rounded-full " +
                      (i >= 3 ? "bg-red-500" : i >= 1 ? "bg-amber-500" : "bg-emerald-500")
                    }
                    style={{ width: `${(b.amount / max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {aging.oldestDue && (
            <p className="mt-3 text-xs text-muted">Oldest due date: {formatDate(aging.oldestDue)}</p>
          )}
        </>
      )}
    </div>
  );
}
