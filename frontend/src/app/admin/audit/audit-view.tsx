"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, ScrollText } from "lucide-react";
import { Button, DataTable, EmptyState, type BulkAction, type TableFilter, type TableView } from "@/components/kit";
import { downloadCsv } from "@/components/admin/ui/csv";

export type AuditItem = {
  id: string;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

/** Plain-words names for the action codes written by recordAudit(). */
const PHRASE: Record<string, string> = {
  "client.deleted": "Moved a client to Trash",
  "client.bulk_deleted": "Moved clients to Trash",
  "client.restored": "Restored clients",
  "client.purged": "Deleted clients for good",
  "client.erased": "Erased a client (NDPA)",
  "client.data_exported": "Exported a client's data (NDPA)",
  "client.ai_mode_changed": "Changed a client's AI mode",
  "client.ai_erased": "Erased a client's AI data",
  "request.status_changed": "Moved a request",
  "request.assigned": "Assigned a request",
  "request.unassigned": "Removed someone from a request",
  "request.item_created": "Asked a client for something",
  "request.draft_sent": "Sent a draft for client review",
  "request.deliverable_final": "Published final files",
  "request.deliverable_draft": "Uploaded a draft",
  "request.deliverable_published": "Published a deliverable",
  "request.trashed": "Moved requests to Trash",
  "request.restored": "Restored requests",
  "invoice.status_changed": "Changed an invoice's status",
  "invoice.reminder_sent": "Sent a payment reminder",
  "invoice.deposit_set": "Set a deposit on an invoice",
  "invoice.balance_created": "Created a balance invoice",
  "invoice.trashed": "Moved invoices to Trash",
  "invoice.bulk_voided": "Voided invoices",
  "invoice.deleted": "Deleted an invoice",
  "quote.follow_up_sent": "Followed up on a quote",
  "payment.applied": "Marked an invoice paid",
  "payment.recorded_manual": "Recorded a payment by hand",
  "payment.removed_manual": "Removed a hand-recorded payment",
  "payment.transfer_confirmed": "Confirmed a bank transfer",
  "payment.transfer_rejected": "Rejected a bank transfer proof",
  "email.retried": "Resent a failed email",
  "backup.created": "Ran a database backup",
  "backup.restore_test": "Ran a restore test",
  "trash.restored": "Restored items from Trash",
  "trash.purged": "Emptied items from Trash",
  "user.deleted": "Deleted a user",
  "auth.signed_in": "Signed in",
  "auth.sign_in_failed": "Failed to sign in",
  "auth.two_step_enabled": "Turned on two-step sign-in",
  "auth.two_step_disabled": "Turned off two-step sign-in",
  "auth.two_step_reset": "Reset someone's two-step sign-in",
  "expense.deleted": "Deleted expenses",
};
export const phrase = (a: string) => PHRASE[a] ?? a.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function summary(meta: Record<string, unknown> | null): string {
  if (!meta) return "";
  if (typeof meta.from === "string" && typeof meta.to === "string") return `${meta.from} → ${meta.to}`;
  const keys = ["number", "client", "invoice", "amount", "reason", "status", "to", "count", "fileName", "file", "pass", "error"];
  return keys
    .filter((k) => meta[k] !== undefined && meta[k] !== null && meta[k] !== "")
    .map((k) => `${k}: ${Array.isArray(meta[k]) ? (meta[k] as unknown[]).join(", ") : String(meta[k])}`)
    .join(" · ")
    .slice(0, 160);
}

const exportCsv = (list: AuditItem[]) =>
  downloadCsv("audit-log", ["When", "Who", "Action", "Code", "Record", "Record id", "Change"], list.map((r) => [r.createdAt, r.actorName ?? "System", phrase(r.action), r.action, r.entity, r.entityId ?? "", JSON.stringify(r.meta ?? {})]));

const MONEY = /invoice|payment|quote|billing/;
const PEOPLE = /user|access|invit|role|ai_mode|erase|export|assign/;
const AI = /sage|ai_|analysis|litchai/;

export function AuditView({ rows }: { rows: AuditItem[] }) {
  const columns = useMemo<ColumnDef<AuditItem, unknown>[]>(
    () => [
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: "When",
        meta: { label: "When", mobile: "meta" },
        cell: ({ row }) => <span className="whitespace-nowrap text-body">{new Date(row.original.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>,
      },
      { id: "actor", accessorFn: (r) => r.actorName ?? "System", header: "Who", meta: { label: "Who", mobile: "subtitle" }, cell: ({ row }) => <span className="font-medium text-ink">{row.original.actorName ?? "System"}</span> },
      { id: "action", accessorFn: (r) => phrase(r.action), header: "Action", meta: { label: "Action", mobile: "title", hideable: false }, cell: ({ row }) => <span className="text-ink">{phrase(row.original.action)}</span> },
      { id: "record", accessorFn: (r) => `${r.entity} ${r.entityId ?? ""}`, header: "Record", meta: { label: "Record", mobile: "hidden" }, cell: ({ row }) => <span className="text-body">{row.original.entity}</span> },
      { id: "change", accessorFn: (r) => summary(r.meta), header: "Change", meta: { label: "Change", mobile: "meta" }, cell: ({ row }) => <span className="block max-w-[340px] whitespace-normal break-words font-mono text-xs text-body">{summary(row.original.meta)}</span> },
    ],
    [],
  );
  const views: TableView<AuditItem>[] = [
    { id: "all", label: "All", predicate: () => true },
    { id: "money", label: "Money", predicate: (r) => MONEY.test(r.action) || MONEY.test(r.entity) },
    { id: "people", label: "People and access", predicate: (r) => PEOPLE.test(r.action) || r.entity === "user" },
    { id: "ai", label: "AI", predicate: (r) => AI.test(r.action) || /sage/i.test(r.actorName ?? "") },
    { id: "data", label: "Deletes and data rights", predicate: (r) => /delete|purge|erase|trash|export/.test(r.action) },
  ];
  const filters = useMemo<TableFilter<AuditItem>[]>(() => {
    const ents = [...new Set(rows.map((r) => r.entity))].sort();
    const actors = [...new Set(rows.map((r) => r.actorName ?? "System"))].sort();
    return [
      { id: "entity", label: "Record type", options: ents.map((e) => ({ value: e, label: e })), match: (r, v) => r.entity === v },
      { id: "actor", label: "Who", options: actors.map((a) => ({ value: a, label: a })), match: (r, v) => (r.actorName ?? "System") === v },
    ];
  }, [rows]);
  const bulk: BulkAction<AuditItem>[] = [
    {
      id: "csv",
      label: "Export CSV",
      icon: <Download className="size-4" />,
      run: (sel) => exportCsv(sel),
    },
  ];
  return (
    <>
      {rows.length > 0 && (
        <div className="mb-3 flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => exportCsv(rows)}>
            <Download className="size-4" /> Export CSV
          </Button>
        </div>
      )}
      <DataTable
      label="Audit log"
      storageKey="admin-audit"
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      views={views}
      filters={filters}
      urlState
      bulkActions={bulk}
      searchPlaceholder="Search person, action or record"
      searchText={(r) => `${r.actorName ?? ""} ${phrase(r.action)} ${r.action} ${r.entity} ${summary(r.meta)}`}
      emptyState={<EmptyState icon={<ScrollText />} title="Nothing logged yet" why="Consequential actions (payments, deletions, status moves, access changes) are recorded here with who did them." />}
      />
    </>
  );
}
