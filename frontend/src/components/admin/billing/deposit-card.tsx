"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { formatMoney } from "@/lib/invoice/money";
import { setDepositAction } from "@/app/admin/billing/billing-actions";

/**
 * Deposit terms on one invoice. The client pays the deposit first (invoice →
 * part paid, work starts), then the balance on the SAME invoice when the
 * final files are delivered (lib/payments/amounts.ts is the one definition).
 */
export function DepositCard({
  invoiceId,
  status,
  currency,
  total,
  paid,
  depositPercent,
}: {
  invoiceId: string;
  status: string;
  currency: string;
  total: number;
  paid: number;
  depositPercent: number | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pct, setPct] = useState(String(depositPercent ?? 50));
  const [busy, setBusy] = useState(false);
  const due = depositPercent ? Math.round(total * depositPercent) / 100 : null;
  const editable = paid === 0 && !["paid", "void"].includes(status);

  const save = async (percent: number | null) => {
    setBusy(true);
    const r = await setDepositAction({ invoiceId, percent });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message);
    router.refresh();
  };

  return (
    <section className="rounded-card border border-hairline bg-paper p-4 sm:p-5">
      <h3 className="font-display text-[15px] font-semibold text-ink">Deposit and balance</h3>
      {depositPercent && due !== null ? (
        <div className="mt-3 space-y-3 text-sm">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
            <dt className="text-muted">Deposit ({depositPercent}%)</dt>
            <dd className="text-right tabular-nums text-ink">{formatMoney(due, currency)}</dd>
            <dt className="text-muted">Paid so far</dt>
            <dd className="text-right tabular-nums text-ink">{formatMoney(paid, currency)}</dd>
            <dt className="text-muted">Balance, on delivery</dt>
            <dd className="text-right font-semibold tabular-nums text-ink">{formatMoney(Math.max(0, total - paid), currency)}</dd>
          </dl>
          <p className="text-body">
            {status === "paid"
              ? "Paid in full."
              : paid + 0.5 >= due
                ? "Deposit received and the work has started. The client pays the balance on this invoice when you deliver."
                : `Waiting for the deposit: ${formatMoney(Math.max(0, due - paid), currency)} still due before work starts.`}
          </p>
          {editable && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => save(null)}>
              Ask for the full amount instead
            </Button>
          )}
        </div>
      ) : editable ? (
        <div className="mt-2 space-y-3 text-sm text-body">
          <p>Ask for part of this invoice up front. The client pays the deposit now and the balance on delivery, on this same invoice.</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink">Deposit</span>
              <select value={pct} onChange={(e) => setPct(e.target.value)} className="h-9 rounded-ctl border border-line-strong bg-paper px-2 text-sm text-ink">
                {[30, 40, 50, 60, 70].map((p) => (
                  <option key={p} value={p}>
                    {p}% ({formatMoney(Math.round(total * p) / 100, currency)})
                  </option>
                ))}
              </select>
            </label>
            <Button size="sm" disabled={busy} onClick={() => save(Number(pct))}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} Ask for a deposit
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-body">{paid > 0 ? "Money has been paid on this invoice, so its terms are fixed." : "This invoice is billed in one payment."}</p>
      )}
    </section>
  );
}
