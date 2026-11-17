"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, ScrollText } from "lucide-react";
import { Button, DataTable, EmptyState, type BulkAction, type TableFilter, type TableView } from "@/components/kit";
import Link from "next/link";
import { downloadCsv } from "@/components/admin/ui/csv";
import { PageHead } from "@/components/admin/ui/surface";

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
  "auth.two_step_exempt": "Made someone's two-step optional",
  "auth.two_step_required": "Made someone's two-step required",
  "auth.password_changed": "Changed a password",
  "auth.password_reset": "Reset a password",
  "auth.password_set": "Set a password",
  "auth.sessions_revoked": "Signed someone out everywhere",
  "auth.session_revoked": "Signed out a device",
  "user.role_changed": "Changed someone's role",
  "user.created_admin": "Created an admin",
  "user.consent": "Recorded a consent choice",
  "invitation.created": "Invited someone",
  "invitation.resent": "Resent an invitation",
  "invitation.revoked": "Withdrew an invitation",
  "invitation.accepted": "Accepted an invitation",
  "client.details_updated": "Updated a client's details",
  "client.merged": "Merged two clients",
  "client.imported": "Imported clients",
  "client.invited": "Invited a client",
  "client.erasure_scheduled": "Scheduled a client erasure",
  "client.erasure_cancelled": "Cancelled a client erasure",
  "request.created_by_firm": "Created a request for a client",
  "request.correction_requested": "Asked for changes to a draft",
  "request.deliverable_added": "Added a deliverable",
  "request_item.received": "Received what was asked for",
  "quote.accepted": "Accepted a quote",
  "quote.declined": "Declined a quote",
  "invoice.bulk_deleted": "Deleted invoices",
  "invoice.bulk_status_changed": "Changed invoices' status",
  "payment.applied_partial": "Recorded a part payment",
  "payment.transfer_proof_uploaded": "Uploaded a transfer proof",
  "workbench.opened": "Opened a workbench",
  "workbench.practice": "Opened a practice workbook",
  "workbench.edited": "Edited a workbook",
  "workbench.restored": "Restored a workbook version",
  "workbench.file_added": "Added a file to a workbench",
  "workbench.download": "Downloaded a workbook",
  "sage.proposal_refused": "Sage refused a change (no permission)",
  "upload.infected": "Blocked an infected upload",
  "notification.unsubscribed": "Unsubscribed from emails",
};
export const phrase = (a: string) => PHRASE[a] ?? a.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** The change in plain words: "sent → paid · ₦250,000.00 · reason: late". */
const LABEL: Record<string, string> = { status: "status", role: "role", mode: "mode", aiMode: "AI mode", count: "items", fileName: "file", file: "file", files: "files", reason: "reason", error: "error" };
const ngn = (v: unknown) =>
  typeof v === "number" || (typeof v === "string" && /^\d+(\.\d+)?$/.test(v)) ? `₦${Number(v).toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : String(v);
const words = (v: unknown) => (typeof v === "string" ? v.replace(/_/g, " ") : typeof v === "boolean" ? (v ? "yes" : "no") : Array.isArray(v) ? v.join(", ") : String(v));
function summary(meta: Record<string, unknown> | null): string {
  if (!meta) return "";
  const bits: string[] = [];
  if (meta.from !== undefined && meta.to !== undefined) bits.push(`${words(meta.from)} → ${words(meta.to)}`);
  if (meta.amount !== undefined && meta.amount !== null) bits.push(ngn(meta.amount));
  if (typeof meta.pass === "boolean") bits.push(meta.pass ? "passed" : "failed");
  for (const k of Object.keys(LABEL)) {
    const v = meta[k];
    if (v === undefined || v === null || v === "" || (k === "status" && meta.from !== undefined)) continue;
    bits.push(`${LABEL[k]}: ${words(v)}`);
  }
  return bits.join(" · ").slice(0, 200);
}

/** The record: its kind, a readable name and (where one exists) a link. */
const KIND: Record<string, string> = {
  client: "Client", request: "Request", invoice: "Invoice", quote: "Quote", payment: "Payment", user: "Person", expense: "Expense",
  workbench: "Workbench", backup: "Backup", invitation: "Invitation", ticket: "Ticket", email: "Email", trash: "Trash", line: "Line",
};
function record(r: AuditItem): { kind: string; name: string; href: string | null } {
  const m = r.meta ?? {};
  const kind = KIND[r.entity] ?? r.entity.replace(/_/g, " ").replace(/^.?/, (c) => c.toUpperCase());
  const pick = [m.number, m.invoice, m.client, m.title, m.name, m.email].find((v) => typeof v === "string" && v.trim()) as string | undefined;
  const id = r.entityId ?? "";
  const name = pick ?? (id ? `…${id.slice(-6)}` : "");
  const href = !id
    ? null
    : r.entity === "client"
      ? `/admin/clients/${id}`
      : r.entity === "request"
        ? `/admin/requests/${id}`
        : r.entity === "invoice"
          ? `/admin/billing/invoices/${id}`
          : r.entity === "quote"
            ? `/admin/billing/quotes/${id}`
            : r.entity === "user"
              ? "/admin/settings/access"
              : r.entity === "workbench" && id.startsWith("wb-")
                ? `/admin/analyses/w/${id}`
                : null;
  return { kind, name, href };
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
        cell: ({ row }) => <span className="whitespace-nowrap text-body">{new Date(row.original.createdAt).toLocaleString("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>,
      },
      { id: "actor", accessorFn: (r) => r.actorName ?? "System", header: "Who", meta: { label: "Who", mobile: "subtitle" }, cell: ({ row }) => <span className="font-medium text-ink">{row.original.actorName ?? "System"}</span> },
      { id: "action", accessorFn: (r) => phrase(r.action), header: "Action", meta: { label: "Action", mobile: "title", hideable: false }, cell: ({ row }) => <span className="text-ink">{phrase(row.original.action)}</span> },
      {
        id: "record",
        accessorFn: (r) => {
          const x = record(r);
          return `${x.kind} ${x.name}`;
        },
        header: "Record",
        meta: { label: "Record", mobile: "meta" },
        cell: ({ row }) => {
          const x = record(row.original);
          return (
            <span className="block min-w-0 text-[13px]">
              <span className="text-muted">{x.kind}</span>
              {x.name ? (
                x.href ? (
                  <Link href={x.href} className="ml-1.5 font-medium text-accent hover:underline dark:text-info" onClick={(e) => e.stopPropagation()}>
                    {x.name}
                  </Link>
                ) : (
                  <span className="ml-1.5 text-ink">{x.name}</span>
                )
              ) : null}
            </span>
          );
        },
      },
      {
        id: "change",
        accessorFn: (r) => summary(r.meta),
        header: "Change",
        meta: { label: "Change", mobile: "meta" },
        cell: ({ row }) => <span className="block max-w-[360px] whitespace-normal break-words text-[13px] text-body">{summary(row.original.meta) || <span className="text-faint">None</span>}</span>,
      },
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
      <PageHead
        title="Audit log"
        lede="Every consequential action, who did it and what changed. Newest first; the last 1,000 entries."
        actions={
          rows.length > 0 ? (
            <Button variant="secondary" size="sm" onClick={() => exportCsv(rows)}>
              <Download className="size-4" /> Export CSV
            </Button>
          ) : null
        }
      />
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
