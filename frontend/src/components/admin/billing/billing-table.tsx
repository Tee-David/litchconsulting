"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Ban, Download, FileText, Send, Trash2 } from "lucide-react";
import { DataTable, EmptyState, StatusChip, type BulkAction, type TableFilter, type TableView } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { formatMoney } from "@/lib/invoice/money";
import { bulkRemindInvoicesAction, bulkTrashDocsAction, bulkVoidDocsAction } from "@/app/admin/billing/billing-actions";
import type { BillingDoc } from "@/app/admin/_lib/billing-data";
import { downloadCsv } from "@/components/admin/ui/csv";

const UNPAID = ["sent", "viewed", "overdue", "partially_paid"];
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

function kindLabel(d: BillingDoc) {
  if (d.kind === "quote") return "Quote";
  if (d.role === "deposit") return `Deposit invoice, ${d.depositPercent}%`;
  if (d.role === "balance") return "Balance invoice";
  return d.status === "paid" ? "Invoice, receipt issued" : "Invoice";
}

/** One list for quotes, invoices and receipts (paid invoices carry the receipt). */
export function BillingTable({ docs }: { docs: BillingDoc[] }) {
  const router = useRouter();
  const toast = useToast();

  const columns = useMemo<ColumnDef<BillingDoc, unknown>[]>(
    () => [
      {
        id: "number",
        accessorKey: "number",
        header: "Number",
        meta: { label: "Number", mobile: "title", hideable: false },
        cell: ({ row: { original: d } }) => (
          <span className="block min-w-0">
            <span className="block font-semibold text-ink">{d.number}</span>
            <span className="block text-xs text-muted">{kindLabel(d)}</span>
          </span>
        ),
      },
      {
        id: "client",
        accessorKey: "client",
        header: "Client",
        meta: { label: "Client", mobile: "subtitle" },
        cell: ({ row: { original: d } }) => (
          <span className="block min-w-0">
            <span className="block truncate text-ink">{d.client}</span>
            <span className="block truncate text-xs text-muted">{d.requestNumber ?? d.title ?? ""}</span>
          </span>
        ),
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        meta: { label: "Status", mobile: "badge" },
        cell: ({ row: { original: d } }) => (
          <StatusChip
            domain={d.kind === "quote" ? "quote" : "invoice"}
            status={d.status}
            suffix={d.role === "deposit" && d.status === "partially_paid" ? "deposit in" : undefined}
          />
        ),
      },
      {
        id: "dueDate",
        accessorFn: (d) => d.dueDate ?? "",
        header: "Due",
        meta: { label: "Due", mobile: "meta" },
        cell: ({ row: { original: d } }) => <span className="whitespace-nowrap text-body">{d.kind === "quote" && d.dueDate ? `Valid to ${fmtDate(d.dueDate)}` : fmtDate(d.dueDate)}</span>,
      },
      {
        id: "total",
        accessorKey: "total",
        header: "Total",
        meta: { label: "Total", align: "right", mobile: "meta" },
        cell: ({ row: { original: d } }) => <span className="tabular-nums text-ink">{formatMoney(d.total, d.currency)}</span>,
      },
      {
        id: "balance",
        accessorKey: "balance",
        header: "Balance",
        meta: { label: "Balance", align: "right", mobile: "hidden" },
        cell: ({ row: { original: d } }) =>
          d.balance > 0 ? <b className="tabular-nums text-ink">{formatMoney(d.balance, d.currency)}</b> : <span className="text-muted">—</span>,
      },
    ],
    [],
  );

  const views = useMemo<TableView<BillingDoc>[]>(
    () => [
      { id: "all", label: "All", predicate: () => true },
      { id: "quotes", label: "Quotes", predicate: (d) => d.kind === "quote" && !["void"].includes(d.status) },
      { id: "invoices", label: "Invoices", predicate: (d) => d.kind === "invoice" },
      { id: "unpaid", label: "Unpaid", predicate: (d) => d.kind === "invoice" && UNPAID.includes(d.status) },
      { id: "late", label: "Late", predicate: (d) => d.late },
      { id: "part", label: "Part paid", predicate: (d) => d.status === "partially_paid" },
      { id: "paid", label: "Paid and receipts", predicate: (d) => d.kind === "invoice" && d.status === "paid" },
      { id: "drafts", label: "Drafts", predicate: (d) => d.status === "draft" },
    ],
    [],
  );

  const filters = useMemo<TableFilter<BillingDoc>[]>(() => {
    const clients = [...new Set(docs.map((d) => d.client))].sort();
    return [
      { id: "client", label: "Client", options: clients.map((c) => ({ value: c, label: c })), match: (d, v) => d.client === v },
      {
        id: "kind",
        label: "Kind",
        options: [
          { value: "quote", label: "Quotes" },
          { value: "deposit", label: "Deposit invoices" },
          { value: "balance", label: "Balance invoices" },
          { value: "plain", label: "Other invoices" },
        ],
        match: (d, v) => (v === "quote" ? d.kind === "quote" : v === "plain" ? d.kind === "invoice" && !d.role : d.role === v),
      },
    ];
  }, [docs]);

  const report = (r: { ok: boolean; message?: string; error?: string }) => {
    if (r.ok) {
      toast.success(r.message ?? "Done");
      router.refresh();
    } else {
      toast.error(r.error ?? "That did not work.");
      throw new Error(r.error);
    }
  };

  const bulk: BulkAction<BillingDoc>[] = [
    {
      id: "remind",
      label: "Send reminder",
      icon: <Send className="size-4" />,
      when: (rows) => rows.every((r) => r.kind === "invoice" && UNPAID.includes(r.status)),
      run: async (rows) => report(await bulkRemindInvoicesAction(rows.map((r) => r.id))),
    },
    {
      id: "pdf",
      label: "Open PDFs",
      icon: <FileText className="size-4" />,
      when: (rows) => rows.length <= 10,
      run: (rows) => {
        for (const r of rows) window.open(`/api/admin/${r.kind === "quote" ? "quotes" : r.status === "paid" ? "receipts" : "invoices"}/${r.id}/pdf`, "_blank", "noopener");
      },
    },
    {
      id: "csv",
      label: "Export CSV",
      icon: <Download className="size-4" />,
      run: (rows) =>
        downloadCsv(
          "billing",
          ["Number", "Kind", "Client", "Request", "Status", "Issued", "Due", "Total", "Paid", "Balance", "Currency"],
          rows.map((d) => [d.number, kindLabel(d), d.client, d.requestNumber ?? "", d.status, d.issueDate, d.dueDate ?? "", d.total, d.paid, d.balance, d.currency]),
        ),
    },
    {
      id: "void",
      label: "Void",
      icon: <Ban className="size-4" />,
      tone: "danger",
      confirm: (rows) => `Void ${rows.length} document${rows.length === 1 ? "" : "s"}? Clients can no longer pay a void invoice or accept a void quote. Paid ones are skipped.`,
      run: async (rows) => report(await bulkVoidDocsAction(rows.map((r) => r.id))),
    },
    {
      id: "trash",
      label: "Move to Trash",
      icon: <Trash2 className="size-4" />,
      tone: "danger",
      when: (rows) => rows.every((r) => ["draft", "void", "declined", "expired"].includes(r.status)),
      confirm: (rows) => `Move ${rows.length} to Trash? They are deleted for good after 30 days unless restored.`,
      run: async (rows) => report(await bulkTrashDocsAction(rows.map((r) => r.id))),
    },
  ];

  return (
    <div data-tour="invoices-table">
      <DataTable
        label="Quotes, invoices and receipts"
        storageKey="admin-billing"
        columns={columns}
        data={docs}
        getRowId={(d) => d.id}
        views={views}
        filters={filters}
        urlState
        searchPlaceholder="Search number, client or request"
        searchText={(d) => `${d.number} ${d.client} ${d.requestNumber ?? ""} ${d.title ?? ""}`}
        bulkActions={bulk}
        rowHref={(d) => `/admin/billing/${d.kind === "quote" ? "quotes" : "invoices"}/${d.id}`}
        initialSort={[]}
        emptyState={
          <EmptyState
            icon={<FileText />}
            title="No quotes or invoices yet"
            why="A quote starts every job: when the client accepts it, the invoice and pay link follow."
            action={
              <Link href="/admin/billing/quotes/new" className="text-sm font-medium text-accent hover:underline">
                Write the first quote
              </Link>
            }
          />
        }
        noMatchState={<EmptyState compact title="Nothing matches" why="Try another view, clear the filters or search for a different number." />}
      />
    </div>
  );
}
