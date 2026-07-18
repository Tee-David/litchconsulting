"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Wallet, ChevronRight } from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { formatMoney, num } from "@/lib/invoice/money";
import { formatDateTime } from "@/lib/format-date";
import { PAYMENT_METHODS, formatPaymentMethod, formatPaymentStatus } from "@/lib/payments/format";
import {
  recordManualPaymentAction,
  deleteManualPaymentAction,
} from "@/app/admin/finance/invoices/actions";
import { PaymentDetailModal, type PaymentView } from "./payment-detail-modal";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-xl border border-hairline bg-paper px-3.5 py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand placeholder:text-muted";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Money on an invoice: how much has landed, the admin's ledger for confirming
 *  a deposit/transfer by hand, and a click-through to any payment's full detail
 *  (incl. Paystack trace fields). Part-payments accumulate — the invoice only
 *  flips to paid once the balance clears. */
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
  payments: PaymentView[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PaymentView | null>(null);
  const [touched, setTouched] = useState(false);
  const [form, setForm] = useState({ amount: "", method: "bank_transfer", date: todayISO(), note: "" });

  const totalN = num(total);
  const paidN = num(amountPaid);
  const balance = Math.max(0, totalN - paidN);
  const pct = totalN > 0 ? Math.min(100, Math.round((paidN / totalN) * 100)) : 0;
  const partial = paidN > 0 && paidN < totalN;

  const amountValid = Number(form.amount) > 0;
  const methodValid = !!form.method;
  const dateValid = !!form.date;

  function record() {
    setTouched(true);
    if (!amountValid) return toast.error("Enter an amount greater than zero.");
    if (!methodValid) return toast.error("Choose a payment method.");
    if (!dateValid) return toast.error("Pick the date the payment was made.");

    startTransition(async () => {
      const res = await recordManualPaymentAction({
        invoiceId,
        amount: Number(form.amount),
        channel: form.method,
        paidAt: form.date,
        note: form.note || undefined,
      });
      if (res.ok) {
        toast.success("Payment recorded.");
        setForm({ amount: "", method: "bank_transfer", date: todayISO(), note: "" });
        setTouched(false);
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
    <div className="rounded-card border border-hairline bg-paper p-4 sm:p-5">
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
        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1 text-sm">
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
                className={cn(inputCls, touched && !amountValid && "border-red-400 ring-1 ring-red-400/40")}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Method</label>
              <Select
                value={form.method}
                onChange={(v) => setForm((f) => ({ ...f, method: v }))}
                options={PAYMENT_METHODS}
                aria-label="Payment method"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Date</label>
              <DatePicker
                value={form.date}
                onChange={(v) => setForm((f) => ({ ...f, date: v }))}
                max={todayISO()}
                invalid={touched && !dateValid}
                ariaLabel="Payment date"
              />
            </div>
          </div>
          <input
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="Reference or note (optional)"
            className={inputCls}
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTouched(false);
              }}
              className="rounded-lg border border-hairline bg-paper px-3 py-2 text-sm font-medium text-ink hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={record}
              disabled={pending}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-60 keep-brand"
            >
              {pending && <Loader2 className="size-4 animate-spin" />} Record
            </button>
          </div>
        </div>
      )}

      {/* Ledger — each row opens full detail */}
      {payments.length > 0 && (
        <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
          {payments.map((p) => {
            const amt = num(p.amountSettled ?? p.amount);
            return (
              <li key={p.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDetail(p)}
                  className="group flex min-w-0 flex-1 items-center gap-2 py-2.5 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium tabular-nums text-ink">
                      {formatMoney(amt, currency)}
                      <span className="text-xs font-normal text-muted">{formatPaymentMethod(p.channel || p.provider)}</span>
                      {p.provider === "manual" && (
                        <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-muted">manual</span>
                      )}
                      {p.status !== "success" && (
                        <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400">
                          {formatPaymentStatus(p.status)}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      {formatDateTime(p.paidAt || p.createdAt)} · {p.reference}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted transition-colors group-hover:text-ink" />
                </button>
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

      <PaymentDetailModal payment={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
