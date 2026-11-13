"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { FileSearch } from "lucide-react";
import { DataTable, EmptyState, type TableFilter, type TableView } from "@/components/kit";
import { RetryButton, plainReason } from "./document-list";
import { cn } from "@/lib/utils";

export type AnalysisRow = {
  id: number;
  fileName: string;
  status: string;
  reason: string;
  rows: number | null;
  needsReview: number;
  clientName: string;
  request: { id: string; number: string } | null;
  createdAt: string;
};

/** The engine's status in plain words, with a tone. */
/** A file with no transaction table (a trial balance, a template) is opened in the workbench, not sorted. */
const notTransactions = (r: { status: string; reason: string }) => r.status === "extraction_failed" && /no recognizable header|not a recogni|no transaction/i.test(r.reason);

function statusWords(s: string): { label: string; tone: "good" | "warn" | "bad" | "info" | "muted" } {
  if (s === "categorized") return { label: "Ready", tone: "good" };
  if (s === "extracted" || s === "categorizing") return { label: "Sorting rows", tone: "info" };
  if (["received", "scanning", "extracting", "queued", "processing"].includes(s)) return { label: "Reading", tone: "info" };
  if (s === "extraction_failed" || s === "failed" || s === "error") return { label: "Failed", tone: "bad" };
  if (s === "rejected") return { label: "Blocked", tone: "bad" };
  if (s === "superseded") return { label: "Replaced", tone: "muted" };
  return { label: s.replace(/_/g, " "), tone: "muted" };
}
const TONE: Record<string, string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  muted: "bg-surface text-muted",
};
const failed = (r: AnalysisRow) => statusWords(r.status).tone === "bad" && !notTransactions(r);

/** Every file the AI has read, across clients, with retry for failures. */
export function AnalysesTable({ rows }: { rows: AnalysisRow[] }) {
  const router = useRouter();
  const columns = useMemo<ColumnDef<AnalysisRow, unknown>[]>(
    () => [
      {
        id: "file",
        accessorKey: "fileName",
        header: "File",
        meta: { label: "File", mobile: "title", hideable: false },
        cell: ({ row: { original: r } }) => (
          <span className="block min-w-0">
            <span className="block truncate font-medium text-ink">{r.fileName}</span>
            <span className="block truncate text-xs text-muted">{r.clientName}</span>
          </span>
        ),
      },
      {
        id: "request",
        accessorFn: (r) => r.request?.number ?? "",
        header: "Request",
        meta: { label: "Request", mobile: "meta" },
        cell: ({ row: { original: r } }) =>
          r.request ? (
            <Link href={`/admin/requests/${r.request.id}`} onClick={(e) => e.stopPropagation()} className="text-accent hover:underline">
              {r.request.number}
            </Link>
          ) : (
            <span className="text-muted">Uploaded directly</span>
          ),
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        meta: { label: "Status", mobile: "badge" },
        cell: ({ row: { original: r } }) => {
          const w = notTransactions(r) ? { label: "Workbench only", tone: "muted" as const } : statusWords(r.status);
          return (
            <span className="flex flex-wrap items-center gap-2">
              <span
                className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", TONE[w.tone])}
                title={notTransactions(r) ? "No list of transactions to sort. Open it in the workbench to work on it." : failed(r) ? plainReason(r.reason) : undefined}
              >
                {w.label}
              </span>
              {r.status === "extraction_failed" && !notTransactions(r) ? <RetryButton documentId={r.id} reason={plainReason(r.reason)} /> : null}
            </span>
          );
        },
      },
      {
        id: "review",
        accessorKey: "needsReview",
        header: "To review",
        meta: { label: "To review", align: "right", mobile: "meta" },
        cell: ({ row: { original: r } }) =>
          r.needsReview > 0 ? <span className="font-semibold text-warn">{r.needsReview} of {r.rows ?? "?"}</span> : <span className="text-muted">{r.rows != null ? `0 of ${r.rows}` : "—"}</span>,
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: "Added",
        meta: { label: "Added", mobile: "hidden" },
        cell: ({ row }) => <span className="whitespace-nowrap text-body">{new Date(row.original.createdAt).toLocaleDateString("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric" })}</span>,
      },
    ],
    [],
  );

  const views: TableView<AnalysisRow>[] = [
    { id: "all", label: "All", predicate: () => true },
    { id: "ready", label: "Ready", predicate: (r) => r.status === "categorized" },
    { id: "review", label: "Needs review", predicate: (r) => r.needsReview > 0 },
    { id: "failed", label: "Failed", predicate: failed },
  ];
  const filters = useMemo<TableFilter<AnalysisRow>[]>(() => {
    const names = [...new Set(rows.map((r) => r.clientName))].sort();
    return names.length > 1 ? [{ id: "client", label: "Client", options: names.map((n) => ({ value: n, label: n })), match: (r, v) => r.clientName === v }] : [];
  }, [rows]);

  return (
    <DataTable
      label="Files the AI has read"
      storageKey="admin-analyses"
      columns={columns}
      data={rows}
      getRowId={(r) => String(r.id)}
      views={views}
      filters={filters}
      // A click handler, not rowHref: the Request cell holds its own link (no link inside a link).
      onRowClick={(r) => router.push(`/admin/analyses/${r.id}`)}
      initialSort={[{ id: "createdAt", desc: true }]}
      searchPlaceholder="Search file, client or request"
      searchText={(r) => `${r.fileName} ${r.clientName} ${r.request?.number ?? ""}`}
      emptyState={
        <EmptyState
          icon={<FileSearch />}
          title="No files analyzed yet"
          why="When a client uploads a ledger or bank statement, select Analyze on the request. You can also upload a file in a new analysis."
        />
      }
    />
  );
}
