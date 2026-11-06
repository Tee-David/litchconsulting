"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, Loader2, Paperclip, Plus, Receipt, Tag, Trash2, Upload, X } from "lucide-react";
import { Button, ConfirmSheet, DataTable, EmptyState, Sheet, type BulkAction, type TableFilter, type TableView } from "@/components/kit";
import { PageHead, Panel, KeyValues } from "@/components/admin/ui/surface";
import { Donut } from "@/components/charts";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/components/admin/ui/toaster";
import { downloadCsv } from "@/components/admin/ui/csv";
import { formatMoney, CURRENCIES } from "@/lib/invoice/money";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, categoryMeta } from "@/lib/accounting/categories";
import { WHT_RATES, type WhtCategory } from "@/lib/calculators/wht";
import taxConfig from "@/lib/tax/nigeria-tax-config.json";
import {
  attachReceiptAction,
  bulkCategoryAction,
  bulkDeleteExpensesAction,
  receiptUrlAction,
  removeReceiptAction,
  saveExpenseAction,
  type ExpenseInput,
} from "@/app/admin/billing/expenses/actions";
import { cn } from "@/lib/utils";

export type ExpenseItem = {
  id: string;
  date: string;
  category: string;
  vendor: string | null;
  description: string | null;
  amount: number;
  vatInput: number;
  whtDeducted: number;
  currency: string;
  method: string | null;
  reference: string | null;
  /** File name when a receipt is attached, else null. */
  receiptName: string | null;
};

export type RemitSummary = {
  monthLabel: string;
  dueLabel: string;
  /** True after the 21st: the month is still running. */
  partial: boolean;
  periodStart: string;
  periodEnd: string;
  wht: number;
  vatOutput: number;
  vatInput: number;
};

const VAT_PCT = taxConfig.vat.standardRatePct;
const round2 = (n: number) => Math.round(n * 100) / 100;
const dateLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const money = (n: number, c = "NGN") => formatMoney(n, c);

const inputCls = "h-10 w-full rounded-ctl border border-hairline bg-paper px-3 text-sm text-ink outline-none transition-colors focus:border-brand focus-visible:ring-2 focus-visible:ring-accent/40";
const labelCls = "mb-1 block text-xs font-medium text-body";
const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp";

type Draft = Omit<ExpenseInput, "amount" | "vatInput" | "whtDeducted"> & { amount: string; vatInput: string; whtDeducted: string; receiptName: string | null };
const blank = (): Draft => ({ date: new Date().toISOString().slice(0, 10), category: "software", vendor: "", description: "", amount: "", vatInput: "", whtDeducted: "", currency: "NGN", method: "transfer", reference: "", receiptName: null });

function putWithProgress(url: string, file: File) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

/** Upload a receipt to private storage; returns its key. Relays small files if the direct PUT is blocked. */
async function uploadReceipt(expenseId: string, file: File): Promise<string> {
  const res = await fetch("/api/admin/expenses/receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expenseId, fileName: file.name, contentType: file.type, sizeBytes: file.size }),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; uploadUrl?: string; key?: string; error?: string };
  if (!res.ok || !body.ok || !body.uploadUrl || !body.key) throw new Error(body.error || "Could not start the upload.");
  try {
    await putWithProgress(body.uploadUrl, file);
    return body.key;
  } catch {
    const form = new FormData();
    form.append("file", file);
    form.append("expenseId", expenseId);
    const relay = await fetch("/api/admin/expenses/receipt", { method: "POST", body: form });
    const rb = (await relay.json().catch(() => ({}))) as { ok?: boolean; key?: string; error?: string };
    if (!relay.ok || !rb.ok || !rb.key) throw new Error(rb.error || "The upload failed. Try again.");
    return rb.key;
  }
}

export function ExpensesView({ items, remit, tabs }: { items: ExpenseItem[]; remit: RemitSummary; tabs?: ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(blank);
  const [editId, setEditId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [whtType, setWhtType] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ExpenseItem[] | null>(null);
  const [recat, setRecat] = useState<{ rows: ExpenseItem[]; category: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  const startAdd = () => {
    setEditId(null);
    setDraft(blank());
    setFile(null);
    setWhtType("");
    setError(null);
    setOpen(true);
  };
  const startEdit = (e: ExpenseItem) => {
    setEditId(e.id);
    setDraft({
      date: e.date,
      category: e.category,
      vendor: e.vendor ?? "",
      description: e.description ?? "",
      amount: String(e.amount),
      vatInput: e.vatInput ? String(e.vatInput) : "",
      whtDeducted: e.whtDeducted ? String(e.whtDeducted) : "",
      currency: e.currency,
      method: e.method ?? "transfer",
      reference: e.reference ?? "",
      receiptName: e.receiptName,
    });
    setFile(null);
    setWhtType("");
    setError(null);
    setOpen(true);
  };

  const amountN = Number(draft.amount) || 0;
  /** VAT inside a VAT-inclusive amount at the standard rate. */
  const suggestVat = () => set({ vatInput: amountN ? String(round2((amountN * VAT_PCT) / (100 + VAT_PCT))) : "" });
  /** WHT on the amount before VAT, at the corporate rate for the chosen type. */
  const applyWht = (type: string) => {
    setWhtType(type);
    const r = WHT_RATES[type as WhtCategory];
    if (!r) return set({ whtDeducted: "" });
    const base = amountN - (Number(draft.vatInput) || 0);
    set({ whtDeducted: base > 0 ? String(round2((base * r.corporate) / 100)) : "" });
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await saveExpenseAction({ ...draft, id: editId ?? undefined });
      if (!r.ok || !r.id) throw new Error(r.error || "The expense was not saved.");
      if (file) {
        try {
          const key = await uploadReceipt(r.id, file);
          const a = await attachReceiptAction(r.id, key, file.name);
          if (!a.ok) throw new Error(a.error);
        } catch (err) {
          // The expense is saved; only the receipt failed. Say so plainly.
          toast.error(`Expense saved, but the receipt did not upload: ${err instanceof Error ? err.message : "try again"}`);
          setOpen(false);
          router.refresh();
          return;
        }
      }
      toast.success(editId ? "Expense updated." : "Expense added.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The expense was not saved.");
    } finally {
      setBusy(false);
    }
  }

  async function openReceipt(id: string) {
    const r = await receiptUrlAction(id);
    if (!r.ok) return toast.error(r.error);
    window.open(r.url, "_blank", "noopener,noreferrer");
  }

  async function dropReceipt() {
    if (!editId) return;
    const r = await removeReceiptAction(editId);
    if (!r.ok) return toast.error(r.error || "The receipt was not removed.");
    set({ receiptName: null });
    toast.success("Receipt removed.");
    router.refresh();
  }

  const columns = useMemo<ColumnDef<ExpenseItem, unknown>[]>(
    () => [
      {
        id: "date",
        accessorKey: "date",
        header: "Date",
        meta: { label: "Date", mobile: "meta" },
        cell: ({ row }) => <span className="whitespace-nowrap text-body">{dateLabel(row.original.date)}</span>,
      },
      {
        id: "vendor",
        accessorFn: (e) => e.vendor ?? e.description ?? "",
        header: "Vendor",
        meta: { label: "Vendor", mobile: "title", hideable: false },
        cell: ({ row: { original: e } }) => (
          <span className="block min-w-0">
            <span className="block truncate font-medium text-ink">{e.vendor || e.description || "Expense"}</span>
            <span className="block truncate text-xs text-muted">
              {categoryMeta(e.category).label}
              {e.vendor && e.description ? ` · ${e.description}` : ""}
            </span>
          </span>
        ),
      },
      {
        id: "amount",
        accessorKey: "amount",
        header: "Amount",
        meta: { label: "Amount", align: "right", mobile: "badge" },
        cell: ({ row }) => <span className="tabular-nums font-medium text-ink">{money(row.original.amount, row.original.currency)}</span>,
      },
      {
        id: "vat",
        accessorKey: "vatInput",
        header: "VAT input",
        meta: { label: "VAT input", align: "right", mobile: "hidden" },
        cell: ({ row }) => <span className="tabular-nums text-body">{row.original.vatInput ? money(row.original.vatInput, row.original.currency) : "—"}</span>,
      },
      {
        id: "wht",
        accessorKey: "whtDeducted",
        header: "WHT deducted",
        meta: { label: "WHT deducted", align: "right", mobile: "hidden" },
        cell: ({ row }) => <span className="tabular-nums text-body">{row.original.whtDeducted ? money(row.original.whtDeducted, row.original.currency) : "—"}</span>,
      },
      {
        id: "receipt",
        accessorFn: (e) => (e.receiptName ? "attached" : "missing"),
        header: "Receipt",
        meta: { label: "Receipt", mobile: "subtitle" },
        cell: ({ row: { original: e } }) =>
          e.receiptName ? (
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                void openReceipt(e.id);
              }}
              className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-hairline bg-surface px-2 text-xs font-medium text-ink hover:bg-cloud focus-visible:ring-2 focus-visible:ring-accent/40 outline-none"
              aria-label={`Open the receipt for ${e.vendor ?? "this expense"}`}
            >
              <Paperclip className="size-3.5" /> Attached
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">Missing</span>
          ),
      },
    ],
    // openReceipt is stable enough for a table cell; it only reads ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const views: TableView<ExpenseItem>[] = [
    { id: "all", label: "All", predicate: () => true },
    { id: "noreceipt", label: "No receipt", predicate: (e) => !e.receiptName },
    { id: "wht", label: "WHT to remit", predicate: (e) => e.whtDeducted > 0 && e.date >= remit.periodStart && e.date < remit.periodEnd },
  ];
  const filters = useMemo<TableFilter<ExpenseItem>[]>(() => {
    const used = new Set(items.map((e) => e.category));
    return [{ id: "category", label: "Category", options: EXPENSE_CATEGORIES.filter((c) => used.has(c.key)).map((c) => ({ value: c.key, label: c.label })), match: (e, v) => e.category === v }];
  }, [items]);
  const bulk: BulkAction<ExpenseItem>[] = [
    { id: "cat", label: "Change category", icon: <Tag className="size-4" />, run: (rows) => setRecat({ rows, category: rows[0]?.category ?? "other" }) },
    {
      id: "csv",
      label: "Export CSV",
      icon: <Download className="size-4" />,
      run: (rows) =>
        downloadCsv(
          "expenses",
          ["Date", "Vendor", "Category", "Description", "Amount", "VAT input", "WHT deducted", "Currency", "Method", "Reference", "Receipt"],
          rows.map((e) => [e.date, e.vendor ?? "", categoryMeta(e.category).label, e.description ?? "", e.amount.toFixed(2), e.vatInput.toFixed(2), e.whtDeducted.toFixed(2), e.currency, e.method ?? "", e.reference ?? "", e.receiptName ? "attached" : "missing"]),
        ),
    },
    { id: "delete", label: "Delete", icon: <Trash2 className="size-4" />, tone: "danger", run: (rows) => setToDelete(rows) },
  ];

  // The category donut covers the FIRS period, like the remit card beside it.
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of items) if (e.currency === "NGN" && e.date >= remit.periodStart && e.date < remit.periodEnd) m.set(e.category, (m.get(e.category) ?? 0) + e.amount);
    return [...m.entries()].map(([k, v]) => ({ label: categoryMeta(k).label, value: v })).sort((a, b) => b.value - a.value);
  }, [items, remit.periodStart, remit.periodEnd]);
  const netVat = round2(remit.vatOutput - remit.vatInput);

  return (
    <>
      <PageHead
        title="Expenses"
        lede="What the firm spent, with VAT you can reclaim and WHT you deducted for FIRS."
        actions={
          <Button variant="primary" onClick={startAdd}>
            <Plus className="size-4" /> Add expense
          </Button>
        }
      />
      {tabs}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <DataTable
            label="Expenses"
            storageKey="admin-expenses"
            columns={columns}
            data={items}
            getRowId={(e) => e.id}
            views={views}
            filters={filters}
            bulkActions={bulk}
            onRowClick={startEdit}
            initialSort={[{ id: "date", desc: true }]}
            searchPlaceholder="Search vendor or category"
            searchText={(e) => `${e.vendor ?? ""} ${e.description ?? ""} ${categoryMeta(e.category).label} ${e.reference ?? ""}`}
            emptyState={
              <EmptyState
                icon={<Receipt />}
                title="No expenses yet"
                why="Record what the firm spends, with the VAT on the receipt and any WHT you deducted. The amounts to remit to FIRS add up here."
                action={
                  <Button variant="primary" onClick={startAdd}>
                    <Plus className="size-4" /> Add expense
                  </Button>
                }
              />
            }
          />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title={`${remit.monthLabel} by category`}>
            {byCategory.length ? (
              <Donut data={byCategory} height={200} format="money" centerLabel="Spent" centerValue={money(byCategory.reduce((s, c) => s + c.value, 0))} />
            ) : (
              <p className="text-sm text-body">No expenses in {remit.monthLabel} yet.</p>
            )}
          </Panel>
          <Panel title={`Remit to FIRS by ${remit.dueLabel}`} sub={remit.partial ? `${remit.monthLabel} so far` : undefined}>
            <KeyValues
              rows={[
                [`WHT deducted, ${remit.monthLabel}`, <span key="w" className="tabular-nums">{money(remit.wht)}</span>],
                ["VAT on invoices issued", <span key="o" className="tabular-nums">{money(remit.vatOutput)}</span>],
                ["Less VAT input", <span key="i" className="tabular-nums">{money(remit.vatInput)}</span>],
                [netVat >= 0 ? "VAT to pay" : "VAT credit to carry", <span key="n" className="tabular-nums font-semibold text-ink">{money(Math.abs(netVat))}</span>],
              ]}
            />
            <p className="mt-3 text-xs text-muted">From the VAT and WHT entered on each line and the tax on invoices issued in {remit.monthLabel} (naira only). Check against your returns before you file.</p>
          </Panel>
        </div>
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!busy}
        title={editId ? "Edit expense" : "Add expense"}
        description="VAT input is the VAT on the receipt you can reclaim. WHT deducted is tax you kept back from the vendor for FIRS."
        size="md"
        footer={
          <>
            <Button onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />} {editId ? "Save changes" : "Add expense"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Date</label>
            <DatePicker value={draft.date} onChange={(v) => set({ date: v })} ariaLabel="Date" />
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <Select value={draft.category} onChange={(v) => set({ category: v })} options={EXPENSE_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))} aria-label="Category" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="exp-vendor">Vendor</label>
            <input id="exp-vendor" value={draft.vendor} onChange={(e) => set({ vendor: e.target.value })} placeholder="e.g. Adeola Properties" className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="exp-amount">Amount paid</label>
            <input id="exp-amount" type="number" inputMode="decimal" min="0" step="0.01" value={draft.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="0.00" className={cn(inputCls, "tabular-nums")} />
          </div>
          <div>
            <label className={labelCls}>Currency</label>
            <Select value={draft.currency ?? "NGN"} onChange={(v) => set({ currency: v })} options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.symbol} ${c.code}` }))} aria-label="Currency" />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-body" htmlFor="exp-vat">VAT input</label>
              <button type="button" onClick={suggestVat} disabled={!amountN} className="min-h-[28px] text-xs font-medium text-accent hover:underline disabled:opacity-50">
                {VAT_PCT}% inside amount
              </button>
            </div>
            <input id="exp-vat" type="number" inputMode="decimal" min="0" step="0.01" value={draft.vatInput} onChange={(e) => set({ vatInput: e.target.value })} placeholder="0.00" className={cn(inputCls, "tabular-nums")} />
          </div>
          <div>
            <label className={labelCls} htmlFor="exp-wht">WHT deducted</label>
            <input id="exp-wht" type="number" inputMode="decimal" min="0" step="0.01" value={draft.whtDeducted} onChange={(e) => { setWhtType(""); set({ whtDeducted: e.target.value }); }} placeholder="0.00" className={cn(inputCls, "tabular-nums")} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Work out WHT (corporate rate, on the amount before VAT)</label>
            <Select
              value={whtType}
              onChange={applyWht}
              placeholder="Choose the payment type"
              options={[{ value: "", label: "No WHT" }, ...Object.entries(WHT_RATES).map(([k, r]) => ({ value: k, label: `${r.label} · ${r.corporate}%` }))]}
              aria-label="WHT payment type"
            />
          </div>
          <div>
            <label className={labelCls}>Paid by</label>
            <Select className="capitalize" value={draft.method ?? "transfer"} onChange={(v) => set({ method: v })} options={PAYMENT_METHODS.map((m) => ({ value: m, label: m[0].toUpperCase() + m.slice(1) }))} aria-label="Paid by" />
          </div>
          <div>
            <label className={labelCls} htmlFor="exp-ref">Reference (optional)</label>
            <input id="exp-ref" value={draft.reference} onChange={(e) => set({ reference: e.target.value })} placeholder="Transfer or receipt number" className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="exp-desc">What was it for? (optional)</label>
            <input id="exp-desc" value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. Abuja trip, Kanem engagement" className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <span className={labelCls}>Receipt</span>
            <input ref={fileRef} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {file ? (
              <div className="flex items-center justify-between gap-2 rounded-ctl border border-hairline bg-surface px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-ink"><Paperclip className="size-4 shrink-0" /><span className="truncate">{file.name}</span></span>
                <Button variant="ghost" size="sm" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }} aria-label="Remove the chosen file"><X className="size-4" /></Button>
              </div>
            ) : draft.receiptName && editId ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-ctl border border-hairline bg-surface px-3 py-2 text-sm">
                <button type="button" onClick={() => openReceipt(editId)} className="flex min-h-[32px] min-w-0 items-center gap-2 text-ink hover:underline">
                  <Paperclip className="size-4 shrink-0" /><span className="truncate">{draft.receiptName}</span>
                </button>
                <span className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>Replace</Button>
                  <Button variant="ghost" size="sm" onClick={dropReceipt}>Remove</Button>
                </span>
              </div>
            ) : (
              <Button onClick={() => fileRef.current?.click()} className="w-full">
                <Upload className="size-4" /> Attach a PDF or photo (max 10 MB)
              </Button>
            )}
          </div>
          {error && <p role="alert" className="sm:col-span-2 rounded-ctl bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        </div>
      </Sheet>

      <ConfirmSheet
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        tone="danger"
        title={`Delete ${toDelete?.length ?? 0} ${toDelete?.length === 1 ? "expense" : "expenses"}?`}
        confirmLabel="Delete"
        body={<p>The expenses and their receipts are deleted for good. This is recorded in the audit log.</p>}
        onConfirm={async () => {
          const r = await bulkDeleteExpensesAction((toDelete ?? []).map((e) => e.id));
          if (!r.ok) throw new Error(r.error);
          toast.success("Deleted.");
          router.refresh();
        }}
      />
      <ConfirmSheet
        open={recat !== null}
        onClose={() => setRecat(null)}
        title={`Change the category of ${recat?.rows.length ?? 0} ${recat?.rows.length === 1 ? "expense" : "expenses"}`}
        confirmLabel="Change category"
        body={
          <Select
            value={recat?.category ?? "other"}
            onChange={(v) => setRecat((r) => (r ? { ...r, category: v } : r))}
            options={EXPENSE_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
            aria-label="New category"
          />
        }
        onConfirm={async () => {
          if (!recat) return;
          const r = await bulkCategoryAction(recat.rows.map((e) => e.id), recat.category);
          if (!r.ok) throw new Error(r.error);
          toast.success("Category changed.");
          router.refresh();
        }}
      />
    </>
  );
}
