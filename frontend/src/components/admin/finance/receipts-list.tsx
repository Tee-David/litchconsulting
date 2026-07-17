"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Download } from "lucide-react";
import { DataTable } from "@/components/admin/ui/data-table";
import { ExportMenu, type ExportColumn } from "@/components/admin/ui/export-menu";
import { formatMoney, num } from "@/lib/invoice/money";
import type { InvoiceRow } from "@/lib/db/queries/invoices";

const clientLabel = (i: InvoiceRow) => i.billToCompany || i.billToName || "—";
const paidOn = (i: InvoiceRow) =>
  i.paidAt ? new Date(i.paidAt as unknown as string).toISOString().slice(0, 10) : i.issueDate || "";

/** Receipts for paid invoices — searchable by client name or invoice number. */
export function ReceiptsList({ paid }: { paid: InvoiceRow[] }) {
  const columns = useMemo<ColumnDef<InvoiceRow, unknown>[]>(
    () => [
      {
        id: "number",
        accessorFn: (i) => i.number,
        header: "Receipt",
        cell: ({ row }) => <span className="font-semibold text-ink">{row.original.number}</span>,
      },
      {
        id: "client",
        accessorFn: clientLabel,
        header: "Client",
        cell: ({ row }) => <span className="text-body">{clientLabel(row.original)}</span>,
      },
      {
        id: "amount",
        accessorFn: (i) => num(i.total),
        header: "Amount",
        cell: ({ row }) => (
          <span className="tabular-nums text-ink">{formatMoney(num(row.original.total), row.original.currency)}</span>
        ),
      },
      {
        id: "paid",
        accessorFn: paidOn,
        header: "Paid",
        cell: ({ row }) => <span className="text-body">{paidOn(row.original)}</span>,
      },
      {
        id: "download",
        header: "",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="text-right">
            <Link
              href={`/api/admin/receipts/${row.original.id}/pdf`}
              target="_blank"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-paper px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-surface"
            >
              <Download className="size-4" /> Download
            </Link>
          </div>
        ),
      },
    ],
    []
  );

  const exportColumns: ExportColumn<InvoiceRow>[] = [
    { header: "Receipt", accessor: (i) => i.number },
    { header: "Client", accessor: (i) => clientLabel(i) },
    { header: "Amount", accessor: (i) => num(i.total) },
    { header: "Currency", accessor: (i) => i.currency },
    { header: "Paid", accessor: (i) => paidOn(i) },
  ];

  return (
    <DataTable
      columns={columns}
      data={paid}
      searchPlaceholder="Search receipts by client or number…"
      getRowId={(i) => i.id}
      toolbar={<ExportMenu rows={paid} columns={exportColumns} filename="receipts" title="Receipts" />}
    />
  );
}
