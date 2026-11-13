import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { workbenchConversation } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/server-user";
import { canAccess, roleOf } from "@/lib/access";
import { assignedRequestIds } from "@/lib/requests/work";
import type { SageCaller } from "@/lib/litchai/client";

/**
 * Who may use Sage, and with what scope. Admins and staff (the "sage" area);
 * never clients. Staff scope = their request_assignment rows and the
 * workbench conversations on those requests, read here on the server and
 * never taken from the browser.
 */
export async function sageCaller(): Promise<(SageCaller & { userId: string; name: string }) | null> {
  const u = await getSessionUser();
  if (!u || u.banned) return null;
  const role = roleOf(u);
  if (!canAccess(role, "sage")) return null;
  if (role === "admin") return { userId: u.id, name: u.name || u.email, role: "admin", requestIds: null, workbenchIds: null };
  if (role !== "staff") return null;
  const requestIds = await assignedRequestIds(u.id);
  const wb = requestIds.length
    ? await db.select({ id: workbenchConversation.id }).from(workbenchConversation).where(inArray(workbenchConversation.requestId, requestIds))
    : [];
  return { userId: u.id, name: u.name || u.email, role: "staff", requestIds, workbenchIds: wb.map((w) => w.id) };
}

/** Cheap check for actions that only need the role (no ids). */
export async function sageRole(): Promise<{ userId: string; role: "admin" | "staff" } | null> {
  const u = await getSessionUser();
  if (!u || u.banned) return null;
  const role = roleOf(u);
  if (role !== "admin" && role !== "staff") return null;
  if (!canAccess(role, "sage")) return null;
  return { userId: u.id, role };
}
