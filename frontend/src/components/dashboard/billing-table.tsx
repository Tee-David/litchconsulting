"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Receipt } from "lucide-react";
import { DataTable, EmptyState, StatusChip } from "@/components/kit";

export type BillingRow = {
  id: string;
  kind: "invoice" | "quote";
  number: string;
  title: string;
  status: string;
  total: string;
  due: string;
  issued: string;
  requestNumber: string | null;
  action: { label: string; href: string } | null;
  owing: boolean;
};

const columns: ColumnDef<BillingRow, unknown>[] = [
  {
    id: "doc",
    header: "Document",
    accessorFn: (r) => r.number,
    meta: { mobile: "title", hideable: false },
    cell: ({ row: { original: r } }) => (
      <span className="block">
        <span className="block font-medium text-ink">{r.title}</span>
        <span className="block text-xs text-muted">
          {r.kind === "quote" ? "Quote" : "Invoice"} {r.number}
          {r.requestNumber ? ` · ${r.requestNumber}` : ""}
        </span>
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    accessorFn: (r) => r.status,
    meta: { mobile: "badge" },
    cell: ({ row: { original: r } }) => <StatusChip domain={r.kind} status={r.status} audience="client" />,
  },
  { id: "total", header: "Amount", accessorFn: (r) => r.total, meta: { align: "right", mobile: "meta" } },
  { id: "due", header: "Due / valid to", accessorFn: (r) => r.due, meta: { mobile: "meta" } },
  { id: "issued", header: "Issued", accessorFn: (r) => r.issued, meta: { defaultHidden: true } },
  {
    id: "action",
    header: "",
    enableSorting: false,
    meta: { label: "Action", hideable: false, align: "right", mobile: "meta" },
    cell: ({ row: { original: r } }) =>
      r.action ? (
        <Link
          href={r.action.href}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex h-8 items-center rounded-ctl bg-act px-3 text-[13px] font-semibold text-act-ink hover:bg-act-hover"
        >
          {r.action.label}
        </Link>
      ) : null,
  },
];

export function BillingTable({ rows }: { rows: BillingRow[] }) {
  const router = useRouter();
  return (
    <DataTable
      label="Invoices and quotes"
      storageKey="client-billing"
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      // A click handler, not rowHref: the Action cell holds its own link (no link inside a link).
      onRowClick={(r) => router.push(r.kind === "quote" ? `/dashboard/quotes/${r.id}` : `/dashboard/invoices/${r.id}`)}
      searchPlaceholder="Search by number or project"
      searchText={(r) => `${r.number} ${r.title} ${r.requestNumber ?? ""}`}
      views={[
        { id: "owing", label: "To pay or answer", predicate: (r) => r.owing },
        { id: "invoices", label: "Invoices", predicate: (r) => r.kind === "invoice" },
        { id: "quotes", label: "Quotes", predicate: (r) => r.kind === "quote" },
        { id: "all", label: "All", predicate: () => true },
      ]}
      emptyState={<EmptyState icon={<Receipt />} title="No invoices or quotes yet" why="Quotes and invoices for your requests appear here, with receipts once paid." />}
    />
  );
}
