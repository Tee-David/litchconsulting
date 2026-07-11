"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Plus, Eye, PenLine, Send, ArrowRightLeft, CheckCircle2, XCircle, Trash2, FileText } from "lucide-react";
import { DataTable } from "@/components/admin/ui/data-table";
import { ExportMenu } from "@/components/admin/ui/export-menu";
import { StatCard } from "@/components/admin/ui/stat-card";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { Badge, invoiceStatusTone } from "@/components/admin/ui/badge";
import { useToast } from "@/components/admin/ui/toaster";
import { formatMoney, num } from "@/lib/invoice/money";
import type { InvoiceRow } from "@/lib/db/queries/invoices";
import {
  deleteInvoiceAction,
  sendInvoiceAction,
  setInvoiceStatusAction,
  convertQuoteToInvoiceAction,
  bulkDeleteInvoicesAction,
  bulkSetInvoiceStatusAction,
} from "@/app/admin/finance/invoices/actions";
import { FileSignature, BadgeCheck, Send as SendIcon, FileEdit, Loader2 } from "lucide-react";

function RowActions({ row }: { row: InvoiceRow }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const width = 190;
      const height = 300;
      const top = r.bottom + height > window.innerHeight ? r.top - height - 4 : r.bottom + 6;
      setPos({ top, left: Math.max(8, r.right - width) });
    }
    setOpen((o) => !o);
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string; id?: string }>, ok: string, goto?: (id: string) => string) {
    setOpen(false);
    const res = await fn();
    if (res.ok) {
      toast.success(res.error || ok);
      if (goto && res.id) router.push(goto(res.id));
      else router.refresh();
    } else toast.error(res.error || "Action failed.");
  }

  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink transition-colors hover:bg-surface";

  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle} className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink" aria-label="Actions">
        <MoreHorizontal className="size-4" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div ref={menuRef} onClick={(e) => e.stopPropagation()} style={{ position: "fixed", top: pos.top, left: pos.left, width: 190 }} className="z-[100] rounded-xl border border-hairline bg-paper p-1.5 shadow-xl shadow-black/15">
            <Link href={`/admin/finance/quotes/${row.id}`} className={item}><Eye className="size-4 text-muted" /> View</Link>
            <Link href={`/admin/finance/quotes/${row.id}/edit`} className={item}><PenLine className="size-4 text-muted" /> Edit</Link>
            <button className={item} onClick={() => run(() => sendInvoiceAction(row.id), "Quote sent.")}><Send className="size-4 text-muted" /> Send</button>
            <button className={item} onClick={() => run(() => convertQuoteToInvoiceAction(row.id), "Converted to invoice.", (id) => `/admin/finance/invoices/${id}`)}><ArrowRightLeft className="size-4 text-muted" /> Convert to invoice</button>
            <button className={item} onClick={() => run(() => setInvoiceStatusAction(row.id, "accepted"), "Marked accepted.")}><CheckCircle2 className="size-4 text-muted" /> Mark accepted</button>
            <button className={item} onClick={() => run(() => setInvoiceStatusAction(row.id, "declined"), "Marked declined.")}><XCircle className="size-4 text-muted" /> Mark declined</button>
            <button className={`${item} text-red-600`} onClick={() => { if (confirm(`Delete quote ${row.number}?`)) run(() => deleteInvoiceAction(row.id), "Deleted."); }}><Trash2 className="size-4" /> Delete</button>
          </div>,
          document.body,
        )}
    </>
  );
}

export function QuoteList({ quotes }: { quotes: InvoiceRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<InvoiceRow[]>([]);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => (status === "all" ? quotes : quotes.filter((q) => q.status === status)), [quotes, status]);

  const stats = useMemo(() => {
    let quoted = 0,
      accepted = 0,
      sent = 0;
    for (const q of quotes) {
      const t = num(q.total);
      quoted += t;
      if (q.status === "accepted") accepted += t;
      if (q.status === "sent") sent += t;
    }
    return { quoted, accepted, sent, count: quotes.length };
  }, [quotes]);

  const clientLabel = (r: InvoiceRow) => r.billToCompany || r.billToName || "—";

  const columns = useMemo<ColumnDef<InvoiceRow, unknown>[]>(
    () => [
      { accessorKey: "number", header: "Quote", cell: ({ row }) => <span className="font-semibold text-ink">{row.original.number}</span> },
      { id: "client", accessorFn: clientLabel, header: "Client" },
      { accessorKey: "projectTitle", header: "Project", cell: ({ getValue }) => (getValue() as string) || "—" },
      { accessorKey: "total", header: "Amount", cell: ({ row }) => <span className="tabular-nums">{formatMoney(num(row.original.total), row.original.currency)}</span> },
      { accessorKey: "issueDate", header: "Issued" },
      { accessorKey: "status", header: "Status", cell: ({ getValue }) => <Badge tone={invoiceStatusTone(getValue() as string)}>{getValue() as string}</Badge> },
      { id: "actions", header: "", enableSorting: false, enableHiding: false, cell: ({ row }) => <RowActions row={row.original} /> },
    ],
    [],
  );

  const exportColumns = [
    { header: "Quote", accessor: (r: InvoiceRow) => r.number },
    { header: "Client", accessor: clientLabel },
    { header: "Amount", accessor: (r: InvoiceRow) => num(r.total) },
    { header: "Currency", accessor: (r: InvoiceRow) => r.currency },
    { header: "Issued", accessor: (r: InvoiceRow) => r.issueDate },
    { header: "Status", accessor: (r: InvoiceRow) => r.status },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total quoted" value={formatMoney(stats.quoted)} icon={FileSignature} />
        <StatCard label="Accepted" value={formatMoney(stats.accepted)} icon={BadgeCheck} />
        <StatCard label="Awaiting" value={formatMoney(stats.sent)} icon={SendIcon} />
        <StatCard label="Quotes" value={stats.count} icon={FileEdit} />
      </div>

      {quotes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No quotes yet"
          description="Draft a quote with the same builder as invoices, then convert an accepted quote into an invoice in one click."
          action={
            <Link href="/admin/finance/quotes/new" className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover">
              <Plus className="size-4" /> New quote
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {selected.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand/20 bg-brand/5 px-4 py-3 text-sm animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2 font-semibold text-ink">
                <FileSignature className="size-4 text-brand" />
                <span>{selected.length} quotes selected</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  defaultValue=""
                  disabled={busy}
                  onChange={async (e) => {
                    const val = e.target.value;
                    if (val) {
                      setBusy(true);
                      const ids = selected.map((q) => q.id);
                      const res = await bulkSetInvoiceStatusAction(ids, val);
                      setBusy(false);
                      if (res.ok) {
                        toast.success("Statuses updated.");
                        router.refresh();
                      } else {
                        toast.error(res.error || "Failed to update statuses.");
                      }
                    }
                    e.target.value = "";
                  }}
                  className="rounded-lg border border-hairline bg-paper px-3 py-1.5 text-xs font-semibold text-ink outline-none cursor-pointer"
                >
                  <option value="" disabled>Change Status...</option>
                  <option value="draft">Mark as Draft</option>
                  <option value="sent">Mark as Sent</option>
                  <option value="accepted">Mark as Accepted</option>
                  <option value="declined">Mark as Declined</option>
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    if (confirm(`Delete ${selected.length} selected quotes?`)) {
                      setBusy(true);
                      const ids = selected.map((q) => q.id);
                      const res = await bulkDeleteInvoicesAction(ids);
                      setBusy(false);
                      if (res.ok) {
                        toast.success("Quotes deleted.");
                        router.refresh();
                      } else {
                        toast.error(res.error || "Failed to delete quotes.");
                      }
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50/50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100/50 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400 cursor-pointer"
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  Delete Selected
                </button>
              </div>
            </div>
          )}

          <DataTable
            columns={columns}
            data={filtered}
            searchPlaceholder="Search quotes…"
            onRowClick={(r) => router.push(`/admin/finance/quotes/${r.id}`)}
            enableSelection={true}
            onSelectionChange={setSelected}
            getRowId={(r) => r.id}
            toolbar={
              <>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border border-hairline bg-paper px-3 text-sm capitalize text-ink outline-none focus:border-brand">
                  {["all", "draft", "sent", "accepted", "declined"].map((s) => (
                    <option key={s} value={s} className="capitalize">
                      {s === "all" ? "All statuses" : s}
                    </option>
                  ))}
                </select>
                <ExportMenu rows={filtered} columns={exportColumns} filename="quotes" title="Quotes" />
              </>
            }
          />
        </div>
      )}
    </div>
  );
}

