"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, Send, Download, Eye, PenLine, Loader2, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { CURRENCIES, DEFAULT_CURRENCY, formatMoney, computeTotals } from "@/lib/invoice/money";
import { DEFAULT_TERMS } from "@/lib/invoice/issuer";
import type { InvoiceInput, InvoiceItemData, InvoiceData } from "@/lib/invoice/types";
import type { ClientRow } from "@/lib/db/queries/clients";
import { InvoicePreview } from "./invoice-preview";
import { ClientCombobox } from "./client-combobox";
import { useToast } from "@/components/admin/ui/toaster";
import { saveInvoiceAction, sendInvoiceAction } from "@/app/admin/finance/invoices/actions";

const today = () => new Date().toISOString().slice(0, 10);
const emptyItem = (): InvoiceItemData => ({ description: "", detail: "", quantity: 1, unitPrice: 0, taxRate: 0 });

const inputCls =
  "w-full rounded-lg border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-brand";
const labelCls = "mb-1 block text-xs font-medium text-body";

export function InvoiceBuilder({
  initial,
  clients,
  defaultNumber,
}: {
  initial?: InvoiceInput;
  clients: ClientRow[];
  defaultNumber: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [id, setId] = useState(initial?.id);
  const [number, setNumber] = useState(initial?.number ?? defaultNumber);
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? today());
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [projectTitle, setProjectTitle] = useState(initial?.projectTitle ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? DEFAULT_CURRENCY);
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [billTo, setBillTo] = useState(initial?.billTo ?? {});
  const [items, setItems] = useState<InvoiceItemData[]>(initial?.items?.length ? initial.items : [emptyItem()]);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [terms, setTerms] = useState(initial?.terms ?? DEFAULT_TERMS);
  const [paymentUrl, setPaymentUrl] = useState(initial?.paymentUrl ?? "");
  const [busy, setBusy] = useState<"save" | "send" | null>(null);
  const [mobileView, setMobileView] = useState<"form" | "preview">("form");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const totals = useMemo(() => computeTotals(items), [items]);

  const data: InvoiceData = {
    number,
    status: initial?.status ?? "draft",
    issueDate,
    dueDate: dueDate || null,
    currency,
    projectTitle: projectTitle || null,
    billTo,
    items,
    notes: notes || null,
    terms: terms || null,
    paymentUrl: paymentUrl || null,
  };

  function payload(status?: string): InvoiceInput {
    return { id, number, status, clientId: clientId || null, billTo, projectTitle, currency, issueDate, dueDate, notes, terms, paymentUrl, items };
  }

  function pickClient(cid: string) {
    setClientId(cid);
    const c = clients.find((x) => x.id === cid);
    if (c) {
      setBillTo({
        name: c.name || undefined,
        company: c.company || undefined,
        email: c.email || undefined,
        address: c.address || undefined,
        taxId: c.taxId || undefined,
      });
    }
  }

  function updateItem(i: number, patch: Partial<InvoiceItemData>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  function reorder(to: number) {
    setItems((prev) => {
      if (dragIndex === null || dragIndex === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDragIndex(null);
    setDragOverIndex(null);
  }

  async function doSave(status = "draft"): Promise<string | undefined> {
    setBusy("save");
    const res = await saveInvoiceAction(payload(status));
    setBusy(null);
    if (!res.ok || !res.id) {
      toast.error(res.error || "Could not save invoice.");
      return undefined;
    }
    setId(res.id);
    toast.success("Invoice saved.");
    return res.id;
  }

  async function onSend() {
    const savedId = await doSave("draft");
    if (!savedId) return;
    if (!billTo.email) {
      toast.error("Add a client email to send.");
      return;
    }
    setBusy("send");
    const res = await sendInvoiceAction(savedId);
    setBusy(null);
    if (!res.ok) return toast.error(res.error || "Could not send.");
    toast.success(res.error || "Invoice sent.");
    router.push(`/admin/finance/invoices/${savedId}`);
  }

  async function onDownload() {
    const savedId = id ?? (await doSave("draft"));
    if (savedId) window.open(`/api/admin/invoices/${savedId}/pdf`, "_blank");
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-hairline bg-paper p-0.5 lg:hidden">
          <button
            onClick={() => setMobileView("form")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${mobileView === "form" ? "bg-brand text-white" : "text-body"}`}
          >
            <PenLine className="size-4" /> Edit
          </button>
          <button
            onClick={() => setMobileView("preview")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${mobileView === "preview" ? "bg-brand text-white" : "text-body"}`}
          >
            <Eye className="size-4" /> Preview
          </button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button onClick={onDownload} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm font-medium text-ink hover:bg-surface">
            <Download className="size-4" /> <span className="hidden sm:inline">PDF</span>
          </button>
          <button
            onClick={() => doSave("draft")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60"
          >
            {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save draft
          </button>
          <button
            onClick={onSend}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-60"
          >
            {busy === "send" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send invoice
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Form */}
        <div className={`min-w-0 space-y-5 ${mobileView === "preview" ? "hidden lg:block" : ""}`}>
          <div className="rounded-card border border-hairline bg-paper p-5">
            <h3 className="mb-4 font-display text-sm font-bold text-ink">Invoice details</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Invoice number</label>
                <input className={inputCls} value={number} onChange={(e) => setNumber(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Issue date</label>
                <input type="date" className={inputCls} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Due date</label>
                <input type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Currency</label>
                <select className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.symbol}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Project title</label>
                <input className={inputCls} placeholder="e.g. Website redesign" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Bill to */}
          <div className="rounded-card border border-hairline bg-paper p-5">
            <h3 className="mb-4 font-display text-sm font-bold text-ink">Bill to</h3>
            {clients.length > 0 && (
              <div className="mb-3">
                <label className={labelCls}>Existing client</label>
                <ClientCombobox clients={clients} value={clientId} onPick={pickClient} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <input className={inputCls} placeholder="Company" value={billTo.company ?? ""} onChange={(e) => setBillTo({ ...billTo, company: e.target.value })} />
              <input className={inputCls} placeholder="Contact name" value={billTo.name ?? ""} onChange={(e) => setBillTo({ ...billTo, name: e.target.value })} />
              <input className={inputCls} placeholder="Email" value={billTo.email ?? ""} onChange={(e) => setBillTo({ ...billTo, email: e.target.value })} />
              <input className={inputCls} placeholder="Tax ID" value={billTo.taxId ?? ""} onChange={(e) => setBillTo({ ...billTo, taxId: e.target.value })} />
              <input className={`${inputCls} col-span-2`} placeholder="Address" value={billTo.address ?? ""} onChange={(e) => setBillTo({ ...billTo, address: e.target.value })} />
            </div>
          </div>

          {/* Items */}
          <div className="rounded-card border border-hairline bg-paper p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-ink">Items</h3>
              <button onClick={() => setItems([...items, emptyItem()])} className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
                <Plus className="size-4" /> Add item
              </button>
            </div>
            <div className="space-y-3">
              {items.map((it, i) => (
                <div
                  key={i}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null && dragOverIndex !== i) setDragOverIndex(i);
                  }}
                  onDrop={() => reorder(i)}
                  className={cn(
                    "rounded-lg border border-hairline p-3 transition-colors",
                    dragOverIndex === i && dragIndex !== null && "border-brand bg-brand-tint/40",
                    dragIndex === i && "opacity-50",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        setDragIndex(i);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDragIndex(null);
                        setDragOverIndex(null);
                      }}
                      title="Drag to reorder"
                      aria-label="Drag to reorder"
                      className="mt-1.5 shrink-0 cursor-grab text-muted transition-colors hover:text-ink active:cursor-grabbing"
                    >
                      <GripVertical className="size-4" />
                    </button>
                    <input className={`${inputCls} flex-1`} placeholder="Description" value={it.description} onChange={(e) => updateItem(i, { description: e.target.value })} />
                    <button
                      onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                      className="mt-1 shrink-0 text-muted transition-colors hover:text-red-500"
                      aria-label="Remove item"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    <div>
                      <label className={labelCls}>Qty</label>
                      <input type="number" min="0" step="1" className={inputCls} value={it.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label className={labelCls}>Unit price</label>
                      <input type="number" min="0" step="0.01" className={inputCls} value={it.unitPrice} onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })} />
                    </div>
                    <div>
                      <label className={labelCls}>Tax %</label>
                      <input type="number" min="0" step="0.5" className={inputCls} value={it.taxRate} onChange={(e) => updateItem(i, { taxRate: Number(e.target.value) })} />
                    </div>
                    <div className="col-span-3 flex flex-col justify-end sm:col-span-1">
                      <label className={labelCls}>Amount</label>
                      <p className="px-1 py-2 text-sm font-semibold tabular-nums text-ink">
                        {formatMoney(totals.lines[i]?.amount ?? 0, currency)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes / payment */}
          <div className="rounded-card border border-hairline bg-paper p-5 space-y-3">
            <div>
              <label className={labelCls}>Payment link (Pay button target)</label>
              <input className={inputCls} placeholder="https://paystack.com/pay/…" value={paymentUrl} onChange={(e) => setPaymentUrl(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Notes</label>
              <textarea rows={2} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Terms</label>
              <textarea rows={2} className={inputCls} value={terms} onChange={(e) => setTerms(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Live preview */}
        <div className={`min-w-0 lg:sticky lg:top-20 lg:self-start ${mobileView === "form" ? "hidden lg:block" : ""}`}>
          <InvoicePreview data={data} />
        </div>
      </div>
    </div>
  );
}
