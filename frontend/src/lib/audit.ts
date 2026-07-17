import "server-only";
import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/server-user";

/**
 * Append one entry to the admin audit trail. Best-effort: any failure (DB
 * hiccup, missing table, running outside a request scope) is swallowed so the
 * underlying admin action is never blocked by logging. When no actor is passed
 * we try to resolve the current admin from the session; that lookup is itself
 * wrapped so a webhook / cron context (no headers) degrades to a null actor.
 */
export async function recordAudit(input: {
  action: string;
  entity: string;
  entityId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    let actorId = input.actorId ?? null;
    let actorName = input.actorName ?? null;

    if (!actorName) {
      try {
        const u = await getSessionUser();
        if (u) {
          actorId = actorId ?? u.id;
          actorName = u.name || u.email;
        }
      } catch {
        // no request scope (webhook/cron) — leave actor null
      }
    }

    await db.insert(auditLog).values({
      actorId,
      actorName,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      meta: (input.meta ?? null) as Record<string, unknown> | null,
    });
  } catch (err) {
    console.error("[audit] failed to record", input.action, err);
  }
}
