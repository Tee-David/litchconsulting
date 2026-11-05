"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { formatMoney } from "@/lib/invoice/money";
import { setDepositAction } from "@/app/admin/billing/billing-actions";

/** Payment terms on a quote: pay in full, or a deposit to start. Carried to the invoice on acceptance. */
export function QuoteDepositCard({
  quoteId,
  status,
  currency,
  total,
  depositPercent,
}: {
  quoteId: string;
  status: string;
  currency: string;
  total: number;
  depositPercent: number | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pct, setPct] = useState<number | null>(depositPercent);
  const [busy, setBusy] = useState(false);
  const locked = ["accepted", "declined", "void", "expired"].includes(status);
  const save = async () => {
    setBusy(true);
    const r = await setDepositAction({ invoiceId: quoteId, percent: pct });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message);
    router.refresh();
  };
  return (
    <section className="h-fit rounded-card border border-hairline bg-paper p-4 sm:p-5">
      <h2 className="font-display text-[15px] font-semibold text-ink">Payment terms</h2>
      {locked ? (
        <p className="mt-2 text-sm text-body">{depositPercent ? `${depositPercent}% deposit to start, balance on delivery.` : "Paid in full to start."} The quote is {status}, so its terms are fixed.</p>
      ) : (
        <div className="mt-3 space-y-2 text-sm" role="radiogroup" aria-label="Payment terms">
          {[null, 30, 40, 50, 60].map((p) => (
            <label key={p ?? "full"} className={`flex cursor-pointer gap-3 rounded-ctl border p-3 ${pct === p ? "border-act bg-brand-tint" : "border-hairline hover:bg-surface"}`}>
              <input type="radio" name="terms" checked={pct === p} onChange={() => setPct(p)} className="mt-1" />
              <span>
                <span className="block font-semibold text-ink">{p ? `${p}% deposit to start, balance on delivery` : "Pay in full to start"}</span>
                <span className="block text-body">{p ? `Deposit invoice ${formatMoney(Math.round(total * p) / 100, currency)} issues when the client accepts` : `One invoice of ${formatMoney(total, currency)}`}</span>
              </span>
            </label>
          ))}
          <div className="flex justify-end pt-1">
            <Button variant="primary" size="sm" disabled={busy || pct === depositPercent} onClick={save}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} Save terms
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
