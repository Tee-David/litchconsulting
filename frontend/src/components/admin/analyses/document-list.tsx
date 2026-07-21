"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/admin/ui/data-table";
import type { LitchaiDocument } from "@/lib/litchai/client";

const STATUS_STYLE: Record<string, string> = {
  received: "bg-surface text-body",
  scanning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  extracting: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  categorizing: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  extracted: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  categorized: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  rejected: "bg-red-500/10 text-red-600 dark:text-red-400",
  extraction_failed: "bg-red-500/10 text-red-600 dark:text-red-400",
  failed: "bg-red-500/10 text-red-600 dark:text-red-400",
  error: "bg-red-500/10 text-red-600 dark:text-red-400",
  superseded: "bg-surface text-muted",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLE[status] ?? "bg-surface text-body";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function DocumentList({ documents }: { documents: LitchaiDocument[] }) {
  const router = useRouter();

  const columns = useMemo<ColumnDef<LitchaiDocument, unknown>[]>(
    () => [
      {
        accessorKey: "filename",
        header: "Document",
        cell: ({ row }) => <span className="font-semibold text-ink">{row.original.filename}</span>,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => <StatusBadge status={getValue() as string} />,
      },
      {
        id: "needs_review",
        header: "Needs review",
        cell: ({ row }) => {
          const n = Number((row.original.progress as Record<string, unknown>)?.needs_review ?? 0);
          return n > 0 ? (
            <span className="font-semibold text-amber-600 dark:text-amber-400">{n}</span>
          ) : (
            <span className="text-muted">—</span>
          );
        },
      },
      {
        accessorKey: "created_at",
        header: "Uploaded",
        cell: ({ getValue }) => (
          <span className="text-body">{new Date(getValue() as string).toLocaleDateString()}</span>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={documents}
      searchPlaceholder="Search documents…"
      onRowClick={(d) => router.push(`/admin/analyses/${d.document_id}`)}
      getRowId={(d) => String(d.document_id)}
    />
  );
}
