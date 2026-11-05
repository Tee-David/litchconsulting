"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRightLeft, Download, Inbox, Trash2, UserPlus } from "lucide-react";
import { DataTable, EmptyState, StatusChip, type BulkAction, type TableFilter, type TableView } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { formatMoney } from "@/lib/invoice/money";
import { STATUS_LABELS, REQUEST_STATUSES, type RequestStatus } from "@/lib/requests/status";
import { restoreRequestsAction, trashRequestsAction } from "@/app/admin/requests/work-actions";
import type { RequestRow, TeamMember } from "@/app/admin/_lib/requests-data";
import { downloadCsv } from "@/components/admin/ui/csv";
import { AssignSheet } from "./assign-sheet";
import { MoveSheet } from "./move-sheet";

const ago = (iso: string) => {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "Today" : d === 1 ? "Yesterday" : `${d} days ago`;
};
const initials = (n: string) =>
  n
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const CLOSED = ["completed", "cancelled", "declined", "refunded"];

/** Needs action: our move AND something concrete is waiting (supplied items, a quote to write, a draft to approve, nobody assigned). */
const needsAction = (r: RequestRow) =>
  !CLOSED.includes(r.status) &&
  (r.suppliedItems > 0 || ["quote_requested", "in_review"].includes(r.status) || (r.assignees.length === 0 && !r.legacyAssignee));

export function RequestList({ rows, team }: { rows: RequestRow[]; team: TeamMember[] }) {
  const router = useRouter();
  const toast = useToast();
  const [assignFor, setAssignFor] = useState<RequestRow[] | null>(null);
  const [moveFor, setMoveFor] = useState<RequestRow[] | null>(null);

  const columns = useMemo<ColumnDef<RequestRow, unknown>[]>(
    () => [
      {
        id: "client",
        accessorKey: "client",
        header: "Request",
        meta: { label: "Request", mobile: "title", hideable: false },
        cell: ({ row: { original: r } }) => (
          <span className="block min-w-0">
            <span className="block truncate font-semibold text-ink">{r.client}</span>
            <span className="block truncate text-xs text-muted">
              {r.number} · {r.service}
              {r.parentId ? " · follow-on" : ""}
            </span>
          </span>
        ),
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        meta: { label: "Status", mobile: "badge" },
        cell: ({ row: { original: r } }) => <StatusChip domain="request" status={r.status} suffix={r.status === "client_review" ? `round ${Math.max(1, r.round)}` : undefined} />,
      },
      {
        id: "next",
        accessorKey: "next",
        header: "Next step",
        meta: { label: "Next step", mobile: "subtitle" },
        cell: ({ row: { original: r } }) => <span className="block max-w-[240px] whitespace-normal text-body">{r.next}</span>,
      },
      {
        id: "assignee",
        accessorFn: (r) => r.assignees.map((a) => a.name).join(", ") || r.legacyAssignee || "",
        header: "Assignee",
        meta: { label: "Assignee", mobile: "meta" },
        cell: ({ row: { original: r } }) =>
          r.assignees.length ? (
            <span className="flex items-center gap-1.5">
              <span className="flex -space-x-1.5">
                {r.assignees.slice(0, 3).map((a) => (
                  <span key={a.id} title={a.name} className="grid size-6 place-items-center rounded-full border-2 border-paper bg-brand-tint text-[10px] font-semibold text-brand">
                    {initials(a.name)}
                  </span>
                ))}
              </span>
              <span className="truncate text-body">{r.assignees[0].name.split(" ")[0]}{r.assignees.length > 1 ? ` +${r.assignees.length - 1}` : ""}</span>
            </span>
          ) : r.legacyAssignee ? (
            <span className="text-body">{r.legacyAssignee}</span>
          ) : CLOSED.includes(r.status) ? (
            <span className="text-muted">—</span>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setAssignFor([r]);
              }}
              className="rounded-ctl border border-line-strong px-2 py-1 text-xs font-medium text-ink hover:bg-surface"
            >
              Assign
            </button>
          ),
      },
      {
        id: "updatedAt",
        accessorKey: "updatedAt",
        header: "Last change",
        meta: { label: "Last change", mobile: "meta" },
        cell: ({ row }) => <span className="whitespace-nowrap text-body">{ago(row.original.updatedAt)}</span>,
      },
      {
        id: "value",
        accessorFn: (r) => r.value ?? 0,
        header: "Value",
        meta: { label: "Value", align: "right", mobile: "hidden" },
        cell: ({ row: { original: r } }) => (r.value ? <span className="tabular-nums text-ink">{formatMoney(r.value, r.currency)}</span> : <span className="text-muted">Quote</span>),
      },
    ],
    [],
  );

  const views: TableView<RequestRow>[] = [
    { id: "action", label: "Needs action", predicate: needsAction },
    { id: "us", label: "With us", predicate: (r) => r.move === "us" && !CLOSED.includes(r.status) },
    { id: "client", label: "Waiting on client", predicate: (r) => r.move === "wait" },
    // Open work nobody is on (Settings → Team and access links here).
    { id: "unassigned", label: "Unassigned", predicate: (r) => !CLOSED.includes(r.status) && r.assignees.length === 0 && !r.legacyAssignee },
    { id: "open", label: "All open", predicate: (r) => !CLOSED.includes(r.status) },
    { id: "done", label: "Done", predicate: (r) => CLOSED.includes(r.status) },
  ];

  const filters = useMemo<TableFilter<RequestRow>[]>(() => {
    const services = [...new Map(rows.map((r) => [r.serviceSlug, r.service])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    return [
      { id: "service", label: "Service", options: services.map(([v, l]) => ({ value: v, label: l })), match: (r, v) => r.serviceSlug === v },
      {
        id: "assignee",
        label: "Assignee",
        options: [{ value: "none", label: "Not assigned" }, ...team.map((t) => ({ value: t.id, label: t.name }))],
        match: (r, v) => (v === "none" ? r.assignees.length === 0 && !r.legacyAssignee : r.assignees.some((a) => a.id === v)),
      },
      {
        id: "status",
        label: "Status",
        options: REQUEST_STATUSES.filter((s) => rows.some((r) => r.status === s)).map((s) => ({ value: s, label: STATUS_LABELS[s] })),
        match: (r, v) => r.status === v,
      },
    ];
  }, [rows, team]);

  const bulk: BulkAction<RequestRow>[] = [
    { id: "assign", label: "Assign to…", icon: <UserPlus className="size-4" />, run: (sel) => setAssignFor(sel) },
    { id: "move", label: "Change status", icon: <ArrowRightLeft className="size-4" />, run: (sel) => setMoveFor(sel) },
    {
      id: "csv",
      label: "Export CSV",
      icon: <Download className="size-4" />,
      run: (sel) =>
        downloadCsv(
          "requests",
          ["Number", "Client", "Service", "Status", "Next step", "Assignees", "Value", "Currency", "Opened", "Last change"],
          sel.map((r) => [
            r.number,
            r.client,
            r.service,
            STATUS_LABELS[r.status as RequestStatus] ?? r.status,
            r.next,
            r.assignees.map((a) => a.name).join("; ") || r.legacyAssignee || "",
            r.value ?? "",
            r.currency,
            r.createdAt.slice(0, 10),
            r.updatedAt.slice(0, 10),
          ]),
        ),
    },
    {
      id: "trash",
      label: "Move to Trash",
      icon: <Trash2 className="size-4" />,
      tone: "danger",
      confirm: (sel) => `Move ${sel.length} ${sel.length === 1 ? "request" : "requests"} to Trash? Clients stop seeing them. You can restore them for 30 days.`,
      run: async (sel) => {
        const r = await trashRequestsAction(sel.map((x) => x.id));
        if (!r.ok) {
          toast.error(r.error);
          throw new Error(r.error);
        }
        const undoId = r.undoId;
        toast.action(r.message, {
          label: "Undo",
          onAction: async () => {
            if (!undoId) return;
            const u = await restoreRequestsAction(undoId);
            if (u.ok) router.refresh();
            else toast.error(u.error);
          },
        });
        router.refresh();
      },
    },
  ];

  return (
    <>
      <div data-tour="requests-table">
        <DataTable
          label="Requests"
          storageKey="admin-requests"
          columns={columns}
          data={rows}
          getRowId={(r) => r.id}
          views={views}
          filters={filters}
          urlState
          searchPlaceholder="Search client, reference or service"
          searchText={(r) => `${r.client} ${r.number} ${r.service} ${r.assignees.map((a) => a.name).join(" ")}`}
          bulkActions={bulk}
          rowHref={(r) => `/admin/requests/${r.id}`}
          emptyState={
            <EmptyState
              icon={<Inbox />}
              title="No requests yet"
              why="Requests arrive when a client picks a service on the website or in their dashboard. Each one shows here with whose move it is."
            />
          }
          noMatchState={<EmptyState compact title="Nothing in this view" why="Try another view or clear the filters. An empty Needs action view is a good sign." />}
        />
      </div>
      <AssignSheet
        open={assignFor !== null}
        onClose={() => setAssignFor(null)}
        requestIds={(assignFor ?? []).map((r) => r.id)}
        label={assignFor?.length === 1 ? `${assignFor[0].number} · ${assignFor[0].client}` : `${assignFor?.length ?? 0} requests`}
        team={team}
        current={assignFor?.length === 1 ? assignFor[0].assignees.map((a) => a.id) : []}
      />
      <MoveSheet open={moveFor !== null} onClose={() => setMoveFor(null)} rows={moveFor ?? []} />
    </>
  );
}
