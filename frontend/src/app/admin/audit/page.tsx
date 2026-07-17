import { PageHeader } from "@/components/admin/ui/page-header";
import { listAuditLog, auditFilterOptions } from "@/lib/db/queries/audit";
import { AuditView, type AuditItem } from "./audit-view";

export const dynamic = "force-dynamic";

/**
 * Admin audit log — a filterable, newest-first trail of destructive/important
 * admin actions. Filters (entity / action) are driven by search params so the
 * view is shareable and server-rendered.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; action?: string }>;
}) {
  const params = await searchParams;
  const entity = params.entity?.trim() || "";
  const action = params.action?.trim() || "";

  const [rows, options] = await Promise.all([
    listAuditLog({ entity: entity || undefined, action: action || undefined, limit: 250 }),
    auditFilterOptions(),
  ]);

  const data: AuditItem[] = rows.map((r) => ({
    id: r.id,
    actorName: r.actorName,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    meta: (r.meta as Record<string, unknown> | null) ?? null,
    createdAt: (r.createdAt as Date).toISOString(),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Every destructive and important admin action, with who did it and when. Newest first (last 250)."
      />
      <AuditView
        rows={data}
        entities={options.entities}
        actions={options.actions}
        filterEntity={entity || "all"}
        filterAction={action || "all"}
      />
    </div>
  );
}
