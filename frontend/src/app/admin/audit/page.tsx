import { requireArea } from "@/lib/server-user";
import { listAuditLog } from "@/lib/db/queries/audit";
import { PageHead } from "@/components/admin/ui/surface";
import { AuditView, type AuditItem } from "./audit-view";

export const dynamic = "force-dynamic";

/** Who did what, newest first (last 1,000 entries), in plain words with the change. */
export default async function AuditPage() {
  await requireArea("audit", "/admin/audit");
  const rows = await listAuditLog({ limit: 1000 });
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
    <div>
      <PageHead title="Audit log" lede="Every consequential action, who did it and what changed. Newest first; the last 1,000 entries." />
      <AuditView rows={data} />
    </div>
  );
}
