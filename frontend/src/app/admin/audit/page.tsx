import { requireArea } from "@/lib/server-user";
import { inArray } from "drizzle-orm";
import { listAuditLog } from "@/lib/db/queries/audit";
import { db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { PageHead } from "@/components/admin/ui/surface";
import { AuditView, type AuditItem } from "./audit-view";

export const dynamic = "force-dynamic";

/** Who did what, newest first (last 1,000 entries), in plain words with the change. */
export default async function AuditPage() {
  await requireArea("audit", "/admin/audit");
  const rows = await listAuditLog({ limit: 1000 });
  // Sign-ins logged before 2026-11-06 carry "sign-in" as the actor; show the person instead.
  const legacy = [...new Set(rows.filter((r) => r.actorName === "sign-in" && r.actorId).map((r) => r.actorId!))];
  const names = new Map(
    legacy.length ? (await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(inArray(user.id, legacy))).map((u) => [u.id, u.name || u.email]) : [],
  );
  const who = (r: (typeof rows)[number]) => (r.actorName === "sign-in" ? (r.actorId && names.get(r.actorId)) || "Unknown device" : r.actorName);
  const data: AuditItem[] = rows.map((r) => ({
    id: r.id,
    actorName: who(r),
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
