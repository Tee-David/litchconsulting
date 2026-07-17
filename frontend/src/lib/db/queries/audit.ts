import "server-only";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";

export type AuditRow = typeof auditLog.$inferSelect;

/** Filtered, newest-first slice of the audit trail (for /admin/audit). */
export async function listAuditLog(opts?: {
  entity?: string;
  action?: string;
  limit?: number;
}): Promise<AuditRow[]> {
  const conds: SQL[] = [];
  if (opts?.entity) conds.push(eq(auditLog.entity, opts.entity));
  if (opts?.action) conds.push(eq(auditLog.action, opts.action));
  return db
    .select()
    .from(auditLog)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(opts?.limit ?? 250);
}

/** Distinct entity / action values present in the log — drives the filters. */
export async function auditFilterOptions(): Promise<{ entities: string[]; actions: string[] }> {
  const [entities, actions] = await Promise.all([
    db.selectDistinct({ v: auditLog.entity }).from(auditLog).orderBy(auditLog.entity),
    db.selectDistinct({ v: auditLog.action }).from(auditLog).orderBy(auditLog.action),
  ]);
  return {
    entities: entities.map((r) => r.v).filter(Boolean),
    actions: actions.map((r) => r.v).filter(Boolean),
  };
}
