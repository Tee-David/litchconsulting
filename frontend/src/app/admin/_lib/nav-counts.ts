import "server-only";
import { and, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { payment, serviceRequest, ticket } from "@/lib/db/schema";
import { attentionCount } from "@/lib/attention/admin";
import type { NavCounts } from "@/components/admin/admin-sidebar";

/** Requests whose next move is ours (the "Needs us" view). */
export const WITH_US_STATUSES = ["quote_requested", "in_progress", "in_review"] as const;

const first = (rows: { n: number | string }[]) => Number(rows[0]?.n ?? 0);

/**
 * Live counts for the sidebar badges. Each is one cheap COUNT; a failure in
 * any of them hides that badge rather than breaking the shell.
 */
export async function navCounts(): Promise<NavCounts> {
  const safe = <T,>(p: Promise<T>, d: T) => p.catch(() => d);
  const [attention, requests, billing, helpDesk] = await Promise.all([
    safe(attentionCount(), 0),
    safe(
      db
        .select({ n: sql<number>`count(*)` })
        .from(serviceRequest)
        .where(and(isNull(serviceRequest.deletedAt), inArray(serviceRequest.status, [...WITH_US_STATUSES])))
        .then(first),
      0,
    ),
    safe(
      db
        .select({ n: sql<number>`count(*)` })
        .from(payment)
        .where(and(isNotNull(payment.proofKey), isNull(payment.confirmedAt), sql`${payment.status} NOT IN ('rejected','success')`))
        .then(first),
      0,
    ),
    safe(
      db
        .select({ n: sql<number>`count(*)` })
        .from(ticket)
        .where(and(isNull(ticket.deletedAt), inArray(ticket.status, ["open"])))
        .then(first),
      0,
    ),
  ]);
  return { attention, requests, billing, helpDesk };
}
