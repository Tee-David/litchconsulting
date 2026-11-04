"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button, StatusChip } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { formatMoney } from "@/lib/invoice/money";
import { createBalanceInvoiceAction, setDepositAction } from "@/app/admin/billing/billing-actions";

type Link_ = { id: string; number: string; status: string; total: number };

/**
 * How one job is billed: deposit invoice → balance invoice → receipts.
 * Lets the admin turn an unpaid invoice into a deposit invoice, and generate
 * the linked balance invoice once the deposit is in.
 */
export function DepositCard({
  invoiceId,
  number,
  status,
  currency,
  total,
  paid,
  depositPercent,
  parent,
  child,
}: {
  invoiceId: string;
  number: string;
  status: string;
  currency: string;
  total: number;
  paid: number;
  depositPercent: number | null;
  parent: Link_ | null;
  child: Link_ | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pct, setPct] = useState(String(depositPercent ?? 50));
  const [busy, setBusy] = useState<string | null>(null);
  const due = depositPercent ? Math.round(total * depositPercent) / 100 : null;
  const editable = paid === 0 && !parent && !["paid", "void"].includes(status);

  const run = async (key: string, fn: () => Promise<{ ok: boolean; message?: string; error?: string; id?: string }>, go?: boolean) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (!r.ok) return toast.error(r.error ?? "That did not work.");
    toast.success(r.message ?? "Done");
    if (go && r.id) router.push(`/admin/billing/invoices/${r.id}`);
    else router.refresh();
  };

  const step = (label: string, l: Link_ | null, current?: boolean, sub?: string) => (
    <div className={`min-w-0 flex-1 rounded-ctl border p-3 ${current ? "border-act" : "border-hairline"}`}>
      <p className="text-xs text-muted">{label}</p>
      {l ? (
        current ? (
          <p className="truncate font-semibold text-ink">{l.number}</p>
        ) : (
          <Link href={`/admin/billing/invoices/${l.id}`} className="block truncate font-semibold text-accent hover:underline">
            {l.number}
          </Link>
        )
      ) : (
        <p className="text-sm text-muted">Not issued yet</p>
      )}
      {l ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <StatusChip domain="invoice" status={l.status} size="sm" />
          <span className="text-xs tabular-nums text-body">{formatMoney(l.total, currency)}</span>
        </div>
      ) : null}
      {sub ? <p className="mt-1 text-xs text-muted">{sub}</p> : null}
    </div>
  );

  return (
    <section className="rounded-card border border-hairline bg-paper p-4 sm:p-5">
      <h3 className="font-display text-[15px] font-semibold text-ink">Deposit and balance</h3>
      {depositPercent || parent ? (
        <>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
            {step(`Deposit ${parent ? "" : `${depositPercent}%`}`.trim(), parent ?? { id: invoiceId, number, status, total }, !parent, due ? `${formatMoney(due, currency)} due now` : undefined)}
            <ArrowRight aria-hidden className="hidden size-4 shrink-0 self-center text-faint sm:block" />
            {step("Balance", parent ? { id: invoiceId, number, status, total } : child, Boolean(parent))}
          </div>
          {!parent && depositPercent ? (
            <div className="mt-3 space-y-2 text-sm text-body">
              <p>
                {paid + 0.5 >= (due ?? 0)
                  ? `Deposit received (${formatMoney(paid, currency)}). Issue the balance invoice when the final work is ready.`
                  : `Waiting for the deposit: ${formatMoney(Math.max(0, (due ?? 0) - paid), currency)} still due.`}
              </p>
              <div className="flex flex-wrap gap-2">
                {!child && (
                  <Button size="sm" variant={paid > 0 ? "primary" : "secondary"} disabled={busy !== null} onClick={() => run("balance", () => createBalanceInvoiceAction(invoiceId), true)}>
                    {busy === "balance" ? <Loader2 className="size-4 animate-spin" /> : null} Create balance invoice
                  </Button>
                )}
                {editable && (
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => run("plain", () => setDepositAction({ invoiceId, percent: null }))}>
                    Make it a normal invoice
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : editable ? (
        <div className="mt-2 space-y-3 text-sm text-body">
          <p>Ask for part of this invoice up front. The client pays the deposit now and the balance on delivery.</p>
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
            <Button size="sm" disabled={busy !== null} onClick={() => run("deposit", () => setDepositAction({ invoiceId, percent: Number(pct) }))}>
              {busy === "deposit" ? <Loader2 className="size-4 animate-spin" /> : null} Make it a deposit invoice
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-body">{paid > 0 ? "Money has been paid on this invoice, so its terms are fixed." : "This invoice is billed in one payment."}</p>
      )}
    </section>
  );
}
