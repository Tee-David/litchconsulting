"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Wallet } from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";
import { formatMoney, num } from "@/lib/invoice/money";
import { formatDateTime } from "@/lib/format-date";
import {
  recordManualPaymentAction,
  deleteManualPaymentAction,
} from "@/app/admin/finance/invoices/actions";
import { cn } from "@/lib/utils";

type PaymentLite = {
  id: string;
  provider: string;
  status: string;
  reference: string;
  amount: string;
  amountSettled: string | null;
  channel: string | null;
  paidAt: string | null;
  createdAt: string;
};

const CHANNELS = ["bank_transfer", "cash", "cheque", "card", "pos", "other"];

const inputCls =
  "w-full rounded-lg border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand";

/** Money on an invoice: how much has landed, and the admin's ledger for
 *  confirming a deposit or bank transfer by hand. Part-payments accumulate —
 *  the invoice only flips to paid once the balance clears. */
export function InvoicePaymentsCard({
  invoiceId,
  currency,
  total,
  amountPaid,
  payments,
}: {
  invoiceId: string;
  currency: string;
  total: string;
  amountPaid: string;
  payments: PaymentLite[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState({ amount: "", channel: "bank_transfer", paidAt: "", note: "" });

  const totalN = num(total);
  const paidN = num(amountPaid);
  const balance = Math.max(0, totalN - paidN);
  const pct = totalN > 0 ? Math.min(100, Math.round((paidN / totalN) * 100)) : 0;
  const partial = paidN > 0 && paidN < totalN;

  function record() {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    startTransition(async () => {
      const res = await recordManualPaymentAction({
        invoiceId,
        amount,
        channel: form.channel,
        paidAt: form.paidAt || undefined,
        note: form.note || undefined,
      });
      if (res.ok) {
        toast.success("Payment recorded.");
        setForm({ amount: "", channel: "bank_transfer", paidAt: "", note: "" });
        setOpen(false);
        router.refresh();
      } else toast.error(res.error || "Could not record the payment.");
    });
  }

  async function remove(id: string) {
    if (!confirm("Remove this recorded payment? The invoice balance will be recalculated.")) return;
    setBusyId(id);
    const res = await deleteManualPaymentAction(id);
    setBusyId(null);
    if (res.ok) {
      toast.success("Payment removed.");
      router.refresh();
    } else toast.error(res.error || "Could not remove the payment.");
  }

  return (
    <div className="rounded-card border border-hairline bg-paper p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold text-ink">
          <Wallet className="size-4 text-brand" /> Payments
        </h3>
        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-paper px-3 py-1.5 text-xs font-semibold text-body transition-colors hover:bg-surface hover:text-ink"
        >
          <Plus className="size-3.5" /> Record payment
        </button>
      </div>

      {/* Balance */}
      <div className="mt-4">
        <div className="flex items-end justify-between gap-3 text-sm">
          <span className="text-body">
            Paid <span className="font-semibold tabular-nums text-ink">{formatMoney(paidN, currency)}</span> of{" "}
            <span className="tabular-nums">{formatMoney(totalN, currency)}</span>
          </span>
          {balance > 0 ? (
            <span className={cn("text-xs font-semibold tabular-nums", partial ? "text-amber-600 dark:text-amber-400" : "text-muted")}>
              {formatMoney(balance, currency)} outstanding
            </span>
          ) : (
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Settled</span>
          )}
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-hairline">
          <div
            className={cn("h-full rounded-full transition-[width]", balance > 0 ? "bg-amber-500" : "bg-emerald-500")}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Record form */}
      {open && (
        <div className="mt-4 space-y-3 rounded-xl border border-hairline bg-surface/40 p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Amount</label>
              <input
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                inputMode="decimal"
                placeholder={String(balance || totalN)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Method</label>
              <select value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))} className={inputCls}>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Date</label>
              <input type="date" value={form.paidAt} onChange={(e) => setForm((f) => ({ ...f, paidAt: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <input
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="Reference or note (optional)"
            className={inputCls}
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-hairline bg-paper px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface">
              Cancel
            </button>
            <button
              type="button"
              onClick={record}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-60 keep-brand"
            >
              {pending && <Loader2 className="size-3.5 animate-spin" />} Record
            </button>
          </div>
        </div>
      )}

      {/* Ledger */}
      {payments.length > 0 && (
        <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
          {payments.map((p) => {
            const amt = num(p.amountSettled ?? p.amount);
            return (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium tabular-nums text-ink">
                    {formatMoney(amt, currency)}
                    <span className="ml-2 text-xs font-normal capitalize text-muted">
                      {(p.channel || p.provider).replace(/_/g, " ")}
                    </span>
                    {p.provider === "manual" && (
                      <span className="ml-2 rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-muted">manual</span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {formatDateTime(p.paidAt || p.createdAt)} · {p.reference}
                    {p.status !== "success" && ` · ${p.status.replace(/_/g, " ")}`}
                  </p>
                </div>
                {p.provider === "manual" && (
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    disabled={busyId === p.id}
                    aria-label="Remove payment"
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
                  >
                    {busyId === p.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
