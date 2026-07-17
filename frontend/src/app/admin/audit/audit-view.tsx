"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { Select } from "@/components/ui/select";
import { DataTable } from "@/components/admin/ui/data-table";
import { Badge, type BadgeTone } from "@/components/admin/ui/badge";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { formatDateTime } from "@/lib/format-date";
import { ScrollText } from "lucide-react";

export type AuditItem = {
  id: string;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

/** Colour the action badge by intent — deletes/voids read as destructive. */
function actionTone(action: string): BadgeTone {
  if (/delete|purge|void|erase|refund|cancel|declin/i.test(action)) return "danger";
  if (/paid|applied|restore|publish|deliver/i.test(action)) return "success";
  if (/status|merge|invite/i.test(action)) return "info";
  return "neutral";
}

/** Compact one-line summary of the meta payload. */
function metaSummary(meta: Record<string, unknown> | null): string {
  if (!meta) return "—";
  const parts = Object.entries(meta)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  return parts.length ? parts.join(" · ") : "—";
}

export function AuditView({
  rows,
  entities,
  actions,
  filterEntity,
  filterAction,
}: {
  rows: AuditItem[];
  entities: string[];
  actions: string[];
  filterEntity: string;
  filterAction: string;
}) {
  const router = useRouter();

  function applyFilters(next: { entity?: string; action?: string }) {
    const entity = next.entity ?? filterEntity;
    const action = next.action ?? filterAction;
    const params = new URLSearchParams();
    if (entity && entity !== "all") params.set("entity", entity);
    if (action && action !== "all") params.set("action", action);
    const qs = params.toString();
    router.push(qs ? `/admin/audit?${qs}` : "/admin/audit");
  }

  const columns = useMemo<ColumnDef<AuditItem, unknown>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "When",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-muted">
            {formatDateTime(row.original.createdAt)}
          </span>
        ),
      },
      {
        accessorKey: "actorName",
        header: "Actor",
        cell: ({ row }) => (
          <span className="font-medium text-ink">{row.original.actorName || "System"}</span>
        ),
      },
      {
        accessorKey: "action",
        header: "Action",
        cell: ({ row }) => (
          <Badge tone={actionTone(row.original.action)} className="normal-case">
            {row.original.action}
          </Badge>
        ),
      },
      {
        accessorKey: "entity",
        header: "Entity",
        cell: ({ row }) => (
          <span className="text-body">
            {row.original.entity}
            {row.original.entityId ? (
              <span className="ml-1 font-mono text-[11px] text-muted">
                {row.original.entityId.slice(0, 8)}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        id: "meta",
        header: "Details",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block max-w-md truncate text-xs text-body" title={metaSummary(row.original.meta)}>
            {metaSummary(row.original.meta)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchPlaceholder="Search actor, action, entity…"
      initialPageSize={25}
      emptyState={
        <EmptyState
          icon={ScrollText}
          title="No audit entries"
          description="Destructive and important admin actions will appear here as they happen."
        />
      }
      toolbar={
        <>
          <Select
            value={filterEntity}
            onChange={(v) => applyFilters({ entity: v })}
            aria-label="Filter by entity"
            className="w-40"
            options={[
              { value: "all", label: "All entities" },
              ...entities.map((e) => ({ value: e, label: e })),
            ]}
          />
          <Select
            value={filterAction}
            onChange={(v) => applyFilters({ action: v })}
            aria-label="Filter by action"
            className="w-52"
            options={[
              { value: "all", label: "All actions" },
              ...actions.map((a) => ({ value: a, label: a })),
            ]}
          />
        </>
      }
    />
  );
}
