"use client";

import { useMemo, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";
import { retryDocumentAction } from "@/app/admin/analyses/actions";
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

/** Turn the engine's failure text into words a person can act on. */
function plainReason(reason: string): string {
  if (!reason) return "The analysis stopped.";
  if (/stalled|worker died/i.test(reason)) return "The analysis stopped part-way (the engine restarted).";
  if (/ForeignKey|taxonomy/i.test(reason)) return "The category list was missing on the AI server. It is fixed now.";
  if (/not a recogni|no transaction|header/i.test(reason)) return "No transaction table was found in this file.";
  return reason.length > 140 ? `${reason.slice(0, 140)}…` : reason;
}

function RetryButton({ documentId, reason }: { documentId: number; reason: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      title={reason}
      disabled={busy}
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        const r = await retryDocumentAction(documentId);
        setBusy(false);
        if (!r.ok) return toast.error(r.error || "The retry did not start.");
        toast.success("Analyzing again. The status updates in a minute.");
        router.refresh();
      }}
      className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-hairline bg-paper px-2.5 text-xs font-medium text-ink outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60"
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />} Analyze again
    </button>
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
        cell: ({ row }) => {
          const d = row.original;
          const reason = String((d.progress as Record<string, unknown>)?.reason ?? "");
          return (
            <span className="flex flex-wrap items-center gap-2">
              <StatusBadge status={d.status} />
              {d.status === "extraction_failed" && <RetryButton documentId={d.document_id} reason={plainReason(reason)} />}
            </span>
          );
        },
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
