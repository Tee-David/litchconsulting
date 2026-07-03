"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Plus, Eye, PenLine, Copy, Send, CheckCircle2, Trash2, FileText } from "lucide-react";
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
  duplicateInvoiceAction,
  sendInvoiceAction,
  setInvoiceStatusAction,
} from "@/app/admin/finance/invoices/actions";
import { Wallet, BadgeCheck, Clock, AlertTriangle } from "lucide-react";

const STATUSES = ["all", "draft", "sent", "paid", "overdue", "void"];

function RowActions({ row }: { row: InvoiceRow }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setOpen(false);
    const res = await fn();
    if (res.ok) toast.success(res.error || ok);
    else toast.error(res.error || "Action failed.");
    router.refresh();
  }

  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink transition-colors hover:bg-surface";

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink"
        aria-label="Actions"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-44 rounded-xl border border-hairline bg-paper p-1.5 shadow-xl shadow-black/10">
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
        </div>
      )}
    </div>
  );
}

export function InvoiceList({ invoices }: { invoices: InvoiceRow[] }) {
  const router = useRouter();
  const [status, setStatus] = useState("all");

  const filtered = useMemo(
    () => (status === "all" ? invoices : invoices.filter((i) => i.status === status)),
    [invoices, status],
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
        cell: ({ getValue }) => {
          const s = getValue() as string;
          return <Badge tone={invoiceStatusTone(s)}>{s}</Badge>;
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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total invoiced" value={formatMoney(stats.invoiced)} icon={Wallet} />
        <StatCard label="Paid" value={formatMoney(stats.paid)} icon={BadgeCheck} />
        <StatCard label="Outstanding" value={formatMoney(stats.outstanding)} icon={Clock} />
        <StatCard label="Overdue" value={stats.overdue} icon={AlertTriangle} />
      </div>

      {invoices.length === 0 ? (
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
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          searchPlaceholder="Search invoices…"
          onRowClick={(r) => router.push(`/admin/finance/invoices/${r.id}`)}
          toolbar={
            <>
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
      )}
    </div>
  );
}
