"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import {
  Wallet,
  TrendingDown,
  Scale,
  Percent,
  Plus,
  PenLine,
  Trash2,
  BookOpen,
  Loader2,
} from "lucide-react";
import { DateRangeFilter, type DateRange } from "@/components/admin/ui/date-range-filter";
import { StatCard } from "@/components/admin/ui/stat-card";
import { DonutChart } from "@/components/admin/ui/charts";
import { ExportMenu, type ExportColumn } from "@/components/admin/ui/export-menu";
import { Modal } from "@/components/admin/ui/modal";
import { useToast } from "@/components/admin/ui/toaster";
import { formatMoney, num, CURRENCIES } from "@/lib/invoice/money";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, categoryMeta } from "@/lib/accounting/categories";
import { saveExpenseAction, deleteExpenseAction, bulkDeleteExpensesAction, type ExpenseInput } from "@/app/admin/finance/accounting/actions";
import type { ExpenseRow } from "@/lib/db/queries/expenses";
import type { InvoiceRow } from "@/lib/db/queries/invoices";
import { cn } from "@/lib/utils";

const ym = (d?: string | Date | null) => (d ? (typeof d === "string" ? d : d.toISOString()).slice(0, 7) : "");

function lastMonths(n: number) {
  const now = new Date();
  return Array.from({ length: n }, (_, idx) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - idx), 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, short: d.toLocaleString("en", { month: "short" }) };
  });
}

const inputCls =
  "h-10 w-full rounded-lg border border-hairline bg-paper px-3 text-sm text-ink outline-none transition-colors focus:border-brand";
const labelCls = "mb-1 block text-xs font-medium text-body";

const EMPTY: ExpenseInput = { date: new Date().toISOString().slice(0, 10), category: "software", amount: "", method: "transfer", currency: "NGN" };

export function AccountingView({ expenses, invoices }: { expenses: ExpenseRow[]; invoices: InvoiceRow[] }) {
  const toast = useToast();
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);

  function toggleExpenseSelect(id: string) {
    setSelectedExpenseIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleAllExpenses(rows: ExpenseRow[]) {
    const ids = rows.map((e) => e.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedExpenseIds.includes(id));
    if (allSelected) {
      setSelectedExpenseIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedExpenseIds((prev) => {
        const next = [...prev];
        for (const id of ids) if (!next.includes(id)) next.push(id);
        return next;
      });
    }
  }


  const currencies = useMemo(() => {
    const set = new Set<string>([...invoices.map((i) => i.currency || "NGN"), ...expenses.map((e) => e.currency || "NGN")]);
    return [...set];
  }, [invoices, expenses]);
  const [currency, setCurrency] = useState<string>(currencies[0] || "NGN");
  const cur = currencies.includes(currency) ? currency : currencies[0] || "NGN";
  const fmt = (n: number) => formatMoney(n, cur);

  const inRange = useCallback((d: string) => (!range.from || d >= range.from) && (!range.to || d <= range.to), [range]);

  // Income = collected (amountPaid) attributed to the paid date, current currency.
  const paidRows = useMemo(
    () =>
      invoices.filter((i) => {
        if ((i.currency || "NGN") !== cur) return false;
        if (num(i.amountPaid) <= 0 || !i.paidAt) return false;
        const paidDate = (typeof i.paidAt === "string" ? i.paidAt : i.paidAt.toISOString()).slice(0, 10);
        return inRange(paidDate);
      }),
    [invoices, cur, inRange],
  );

  const expenseRows = useMemo(() => expenses.filter((e) => (e.currency || "NGN") === cur && inRange(e.date)), [expenses, cur, inRange]);

  const income = useMemo(() => paidRows.reduce((s, i) => s + num(i.amountPaid), 0), [paidRows]);
  const totalExpense = useMemo(() => expenseRows.reduce((s, e) => s + num(e.amount), 0), [expenseRows]);
  const net = income - totalExpense;
  const margin = income ? Math.round((net / income) * 100) : 0;

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenseRows) map.set(e.category, (map.get(e.category) || 0) + num(e.amount));
    return EXPENSE_CATEGORIES.map((c) => ({ label: c.label, value: map.get(c.key) || 0, color: c.color })).filter((c) => c.value > 0).sort((a, b) => b.value - a.value);
  }, [expenseRows]);

  const months = useMemo(() => lastMonths(6), []);
  const monthly = useMemo(
    () =>
      months.map((m) => ({
        short: m.short,
        income: invoices
          .filter((i) => (i.currency || "NGN") === cur && i.paidAt && ym(i.paidAt) === m.key)
          .reduce((s, i) => s + num(i.amountPaid), 0),
        expense: expenses.filter((e) => (e.currency || "NGN") === cur && ym(e.date) === m.key).reduce((s, e) => s + num(e.amount), 0),
      })),
    [months, invoices, expenses, cur],
  );
  const maxMonth = Math.max(1, ...monthly.flatMap((m) => [m.income, m.expense]));

  const exportCols: ExportColumn<ExpenseRow>[] = [
    { header: "Date", accessor: (e) => e.date },
    { header: "Category", accessor: (e) => categoryMeta(e.category).label },
    { header: "Vendor", accessor: (e) => e.vendor || "" },
    { header: "Description", accessor: (e) => e.description || "" },
    { header: "Method", accessor: (e) => e.method || "" },
    { header: "Reference", accessor: (e) => e.reference || "" },
    { header: "Amount", accessor: (e) => num(e.amount) },
    { header: "Currency", accessor: (e) => e.currency },
  ];

  function openNew() {
    setEditing({ ...EMPTY, date: new Date().toISOString().slice(0, 10), currency: cur });
    setModalOpen(true);
  }
  function openEdit(e: ExpenseRow) {
    setEditing({
      id: e.id,
      date: e.date,
      category: e.category,
      vendor: e.vendor || "",
      description: e.description || "",
      amount: num(e.amount),
      currency: e.currency,
      method: e.method || "transfer",
      reference: e.reference || "",
    });
    setModalOpen(true);
  }

  async function save() {
    setBusy(true);
    const res = await saveExpenseAction(editing);
    setBusy(false);
    if (res.ok) {
      toast.success(editing.id ? "Expense updated." : "Expense added.");
      setModalOpen(false);
    } else toast.error(res.error || "Could not save.");
  }

  async function remove(id: string) {
    if (!confirm("Delete this expense entry?")) return;
    setDeleting(id);
    const res = await deleteExpenseAction(id);
    setDeleting(null);
    if (res.ok) toast.success("Expense deleted.");
    else toast.error(res.error || "Could not delete.");
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter onChange={setRange} />
          {currencies.length > 1 && (
            <select value={cur} onChange={(e) => setCurrency(e.target.value)} className="h-9 rounded-lg border border-hairline bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-brand">
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {CURRENCIES.find((x) => x.code === c)?.symbol || ""} {c}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu rows={expenseRows} columns={exportCols} filename="expenses" title={`Expenses (${cur})`} />
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            <Plus className="size-4" /> Add expense
          </button>
        </div>
      </div>

      {/* P&L cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Revenue collected" value={fmt(income)} icon={Wallet} hint={`${paidRows.length} payments`} />
        <StatCard label="Expenses" value={fmt(totalExpense)} icon={TrendingDown} hint={`${expenseRows.length} entries`} />
        <StatCard label="Net profit" value={fmt(net)} icon={Scale} />
        <StatCard label="Profit margin" value={`${margin}%`} icon={Percent} />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-card border border-hairline bg-paper p-5 lg:col-span-2">
          <h3 className="mb-4 font-display text-sm font-bold text-ink">Income vs expenses — last 6 months</h3>
          <div className="flex items-end justify-between gap-3" style={{ height: 200 }}>
            {monthly.map((m) => (
              <div key={m.short} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 items-end justify-center gap-1">
                  <div
                    className="w-1/2 max-w-8 rounded-t bg-brand dark:bg-highlight"
                    style={{ height: `${(m.income / maxMonth) * 100}%`, minHeight: m.income > 0 ? 3 : 0 }}
                    title={`Income ${fmt(m.income)}`}
                  />
                  <div
                    className="w-1/2 max-w-8 rounded-t bg-danger/70"
                    style={{ height: `${(m.expense / maxMonth) * 100}%`, minHeight: m.expense > 0 ? 3 : 0 }}
                    title={`Expenses ${fmt(m.expense)}`}
                  />
                </div>
                <span className="text-[11px] text-muted">{m.short}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-center gap-4 text-xs text-body">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-brand dark:bg-highlight" /> Income
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-danger/70" /> Expenses
            </span>
          </div>
        </div>

        <div className="rounded-card border border-hairline bg-paper p-5">
          <h3 className="mb-4 font-display text-sm font-bold text-ink">Expenses by category</h3>
          {byCategory.length === 0 ? (
            <p className="py-8 text-center text-sm text-body">No expenses in this range.</p>
          ) : (
            <>
              <DonutChart segments={byCategory} centerValue={fmt(totalExpense).replace(/\.00$/, "")} centerLabel="spent" />
              <div className="mt-4 space-y-2">
                {byCategory.slice(0, 6).map((c) => (
                  <div key={c.label} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-body">
                      <span className="size-2.5 rounded-full" style={{ background: c.color }} />
                      {c.label}
                    </span>
                    <span className="font-medium tabular-nums text-ink">{fmt(c.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Ledger */}
      <div className="space-y-3">
        {selectedExpenseIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand/20 bg-brand/5 px-4 py-3 text-sm animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2 font-semibold text-ink">
              <BookOpen className="size-4 text-brand" />
              <span>{selectedExpenseIds.length} expenses selected</span>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (confirm(`Delete ${selectedExpenseIds.length} selected expenses?`)) {
                  setBusy(true);
                  const res = await bulkDeleteExpensesAction(selectedExpenseIds);
                  setBusy(false);
                  if (res.ok) {
                    toast.success("Expenses deleted.");
                    setSelectedExpenseIds([]);
                  } else {
                    toast.error(res.error || "Failed to delete expenses.");
                  }
                }
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50/50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100/50 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400 cursor-pointer"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Delete Selected
            </button>
          </div>
        )}

        <div className="rounded-card border border-hairline bg-paper">
          <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
            <h3 className="font-display text-sm font-bold text-ink">Expense ledger</h3>
            <span className="text-xs text-muted">{expenseRows.length} entries</span>
          </div>
          {expenseRows.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-brand-tint text-brand">
                <BookOpen className="size-6" />
              </div>
              <h3 className="font-display text-lg font-semibold text-ink">No expenses logged yet</h3>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-body">
                Track outgoings — rent, salaries, software, taxes — and your net profit and margin update automatically.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={expenseRows.length > 0 && expenseRows.every((e) => selectedExpenseIds.includes(e.id))}
                        onChange={() => toggleAllExpenses(expenseRows)}
                        className="size-4 rounded border-hairline text-brand accent-brand cursor-pointer focus:ring-brand"
                      />
                    </th>
                    <th className="px-5 py-3 font-semibold">Date</th>
                    <th className="px-5 py-3 font-semibold">Category</th>
                    <th className="px-5 py-3 font-semibold">Vendor / description</th>
                    <th className="px-5 py-3 font-semibold">Method</th>
                    <th className="px-5 py-3 text-right font-semibold">Amount</th>
                    <th className="px-5 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {expenseRows.map((e) => {
                    const meta = categoryMeta(e.category);
                    return (
                      <tr key={e.id} className="transition-colors hover:bg-surface/50">
                        <td className="px-5 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={selectedExpenseIds.includes(e.id)}
                            onChange={() => toggleExpenseSelect(e.id)}
                            className="size-4 rounded border-hairline text-brand accent-brand cursor-pointer focus:ring-brand"
                          />
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-body">{e.date}</td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-1.5 text-ink">
                            <span className="size-2.5 rounded-full" style={{ background: meta.color }} />
                            {meta.label}
                          </span>
                        </td>
                        <td className="max-w-[240px] px-5 py-3">
                          <p className="truncate font-medium text-ink">{e.vendor || e.description || "—"}</p>
                          {e.vendor && e.description && <p className="truncate text-xs text-muted">{e.description}</p>}
                        </td>
                        <td className="px-5 py-3 capitalize text-body">{e.method || "—"}</td>
                        <td className="whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums text-ink">{formatMoney(num(e.amount), e.currency)}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(e)}
                              className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink"
                              aria-label="Edit"
                            >
                              <PenLine className="size-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => remove(e.id)}
                              disabled={deleting === e.id}
                              className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                              aria-label="Delete"
                            >
                              {deleting === e.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add / edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing.id ? "Edit expense" : "Add expense"}
        description="Recorded against your profit & loss."
        size="lg"
        footer={
          <>
            <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-hairline bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />} {editing.id ? "Save changes" : "Add expense"}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Date</label>
            <input type="date" value={editing.date} onChange={(e) => setEditing((s) => ({ ...s, date: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <select value={editing.category} onChange={(e) => setEditing((s) => ({ ...s, category: e.target.value }))} className={inputCls}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Amount</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={editing.amount}
              onChange={(e) => setEditing((s) => ({ ...s, amount: e.target.value }))}
              placeholder="0.00"
              className={cn(inputCls, "tabular-nums")}
            />
          </div>
          <div>
            <label className={labelCls}>Currency</label>
            <select value={editing.currency} onChange={(e) => setEditing((s) => ({ ...s, currency: e.target.value }))} className={inputCls}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol} {c.code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Payment method</label>
            <select value={editing.method} onChange={(e) => setEditing((s) => ({ ...s, method: e.target.value }))} className={cn(inputCls, "capitalize")}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Vendor</label>
            <input value={editing.vendor} onChange={(e) => setEditing((s) => ({ ...s, vendor: e.target.value }))} placeholder="e.g. AWS, landlord" className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Description</label>
            <input value={editing.description} onChange={(e) => setEditing((s) => ({ ...s, description: e.target.value }))} placeholder="What was this for?" className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Reference (optional)</label>
            <input value={editing.reference} onChange={(e) => setEditing((s) => ({ ...s, reference: e.target.value }))} placeholder="Receipt / transaction ref" className={inputCls} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
