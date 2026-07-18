"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Plus, Eye, PenLine, Copy, Send, CheckCircle2, Trash2, FileText } from "lucide-react";
import { DataTable } from "@/components/admin/ui/data-table";
import { ExportMenu } from "@/components/admin/ui/export-menu";
import { DateRangeFilter, type DateRange } from "@/components/admin/ui/date-range-filter";
import { StatCard } from "@/components/admin/ui/stat-card";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { Badge, invoiceStatusTone } from "@/components/admin/ui/badge";
import { useToast } from "@/components/admin/ui/toaster";
import { formatMoney, num } from "@/lib/invoice/money";
import type { InvoiceRow } from "@/lib/db/queries/invoices";
import {
  deleteInvoiceAction,
  duplicateInvoiceAction,
  sendInvoiceAction,
  setInvoiceStatusAction,
  bulkDeleteInvoicesAction,
  bulkSetInvoiceStatusAction,
} from "@/app/admin/finance/invoices/actions";
import { Wallet, BadgeCheck, Clock, AlertTriangle, Loader2 } from "lucide-react";

const STATUSES = ["all", "draft", "sent", "paid", "overdue", "void"];

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
      const width = 180;
      const height = 268;
      const top = r.bottom + height > window.innerHeight ? r.top - height - 4 : r.bottom + 6;
      setPos({ top, left: Math.max(8, r.right - width) });
    }
    setOpen((o) => !o);
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setOpen(false);
    const res = await fn();
    if (res.ok) toast.success(res.error || ok);
    else toast.error(res.error || "Action failed.");
    router.refresh();
  }

  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink transition-colors hover:bg-surface";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink"
        aria-label="Actions"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: 180 }}
            className="z-[100] rounded-xl border border-hairline bg-paper p-1.5 shadow-xl shadow-black/15"
          >
            <Link href={`/admin/finance/invoices/${row.id}`} className={item}>
              <Eye className="size-4 text-muted" /> View
            </Link>
            <Link href={`/admin/finance/invoices/${row.id}/edit`} className={item}>
              <PenLine className="size-4 text-muted" /> Edit
            </Link>
            <button className={item} onClick={() => run(() => sendInvoiceAction(row.id), "Invoice sent.")}>
              <Send className="size-4 text-muted" /> Send
            </button>
            <button className={item} onClick={() => run(() => setInvoiceStatusAction(row.id, "paid"), "Marked paid.")}>
              <CheckCircle2 className="size-4 text-muted" /> Mark paid
            </button>
            <button className={item} onClick={() => run(() => duplicateInvoiceAction(row.id), "Duplicated.")}>
              <Copy className="size-4 text-muted" /> Duplicate
            </button>
            <button
              className={`${item} text-red-600`}
              onClick={() => {
                if (confirm(`Delete invoice ${row.number}?`)) run(() => deleteInvoiceAction(row.id), "Deleted.");
              }}
            >
              <Trash2 className="size-4" /> Delete
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

export function InvoiceList({ invoices }: { invoices: InvoiceRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState("all");
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });
  const [selected, setSelected] = useState<InvoiceRow[]>([]);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(
    () =>
      invoices.filter((i) => {
        if (status !== "all" && i.status !== status) return false;
        const d = i.issueDate || "";
        if (dateRange.from && d < dateRange.from) return false;
        if (dateRange.to && d > dateRange.to) return false;
        return true;
      }),
    [invoices, status, dateRange],
  );

  const stats = useMemo(() => {
    let invoiced = 0,
      paid = 0,
      outstanding = 0,
      overdue = 0;
    for (const i of invoices) {
      const t = num(i.total);
      invoiced += t;
      if (i.status === "paid") paid += t;
      if (i.status === "sent" || i.status === "overdue") outstanding += t - num(i.amountPaid);
      if (i.status === "overdue") overdue++;
    }
    return { invoiced, paid, outstanding, overdue };
  }, [invoices]);

  const clientLabel = (r: InvoiceRow) => r.billToCompany || r.billToName || "—";

  const columns = useMemo<ColumnDef<InvoiceRow, unknown>[]>(
    () => [
      {
        accessorKey: "number",
        header: "Invoice",
        cell: ({ row }) => <span className="font-semibold text-ink">{row.original.number}</span>,
      },
      { id: "client", accessorFn: clientLabel, header: "Client" },
      { accessorKey: "projectTitle", header: "Project", cell: ({ getValue }) => (getValue() as string) || "—" },
      {
        accessorKey: "total",
        header: "Amount",
        cell: ({ row }) => (
          <span className="tabular-nums">{formatMoney(num(row.original.total), row.original.currency)}</span>
        ),
      },
      { accessorKey: "issueDate", header: "Issued" },
      { accessorKey: "dueDate", header: "Due", cell: ({ getValue }) => (getValue() as string) || "—" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue, row }) => {
          const s = getValue() as string;
          // Part-paid is invisible in `status` alone — surface it so the ledger
          // doesn't read as "nothing received" on a deposit.
          const paid = num(row.original.amountPaid);
          const partial = s !== "paid" && paid > 0 && paid < num(row.original.total);
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={invoiceStatusTone(s)}>{s}</Badge>
              {partial && <Badge tone="warning">Partial</Badge>}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => <RowActions row={row.original} />,
      },
    ],
    [],
  );

  const exportColumns = [
    { header: "Invoice", accessor: (r: InvoiceRow) => r.number },
    { header: "Client", accessor: clientLabel },
    { header: "Project", accessor: (r: InvoiceRow) => r.projectTitle || "" },
    { header: "Amount", accessor: (r: InvoiceRow) => num(r.total) },
    { header: "Currency", accessor: (r: InvoiceRow) => r.currency },
    { header: "Issued", accessor: (r: InvoiceRow) => r.issueDate },
    { header: "Due", accessor: (r: InvoiceRow) => r.dueDate || "" },
    { header: "Status", accessor: (r: InvoiceRow) => r.status },
  ];

  return (
    <div className="space-y-6">
      <div data-tour="invoice-stats" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total invoiced" value={formatMoney(stats.invoiced)} icon={Wallet} />
        <StatCard label="Paid" value={formatMoney(stats.paid)} icon={BadgeCheck} />
        <StatCard label="Outstanding" value={formatMoney(stats.outstanding)} icon={Clock} />
        <StatCard label="Overdue" value={stats.overdue} icon={AlertTriangle} />
      </div>

      {/* Both branches carry the tour anchor so the step resolves even when
          there are no invoices yet. */}
      {invoices.length === 0 ? (
        <div data-tour="invoices-table">
          <EmptyState
            icon={FileText}
            title="No invoices yet"
            description="Create your first invoice — add line items, preview the branded document, then send it to your client."
            action={
              <Link
                href="/admin/finance/invoices/new"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
              >
                <Plus className="size-4" /> New invoice
              </Link>
            }
          />
        </div>
      ) : (
        <div data-tour="invoices-table" className="space-y-4">
          {selected.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand/20 bg-brand/5 px-4 py-3 text-sm animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2 font-semibold text-ink">
                <FileText className="size-4 text-brand" />
                <span>{selected.length} invoices selected</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  defaultValue=""
                  disabled={busy}
                  onChange={async (e) => {
                    const val = e.target.value;
                    if (val) {
                      setBusy(true);
                      const ids = selected.map((i) => i.id);
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
                  <option value="paid">Mark as Paid</option>
                  <option value="void">Mark as Void</option>
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    if (confirm(`Delete ${selected.length} selected invoices?`)) {
                      setBusy(true);
                      const ids = selected.map((i) => i.id);
                      const res = await bulkDeleteInvoicesAction(ids);
                      setBusy(false);
                      if (res.ok) {
                        toast.success("Invoices deleted.");
                        router.refresh();
                      } else {
                        toast.error(res.error || "Failed to delete invoices.");
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
            searchPlaceholder="Search invoices…"
            onRowClick={(r) => router.push(`/admin/finance/invoices/${r.id}`)}
            enableSelection={true}
            onSelectionChange={setSelected}
            getRowId={(r) => r.id}
            toolbar={
              <>
                <DateRangeFilter onChange={setDateRange} />
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="h-9 rounded-lg border border-hairline bg-paper px-3 text-sm capitalize text-ink outline-none focus:border-brand"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s} className="capitalize">
                      {s === "all" ? "All statuses" : s}
                    </option>
                  ))}
                </select>
                <ExportMenu rows={filtered} columns={exportColumns} filename="invoices" title="Invoices" />
              </>
            }
          />
        </div>
      )}
    </div>
  );
}

