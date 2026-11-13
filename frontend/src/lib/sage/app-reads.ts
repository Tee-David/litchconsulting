import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  auditLog,
  client,
  invoice,
  payment,
  requestAssignment,
  requestItem,
  reviewRound,
  serviceRequest,
  user,
} from "@/lib/db/schema";
import { proofPending } from "@/lib/attention/admin";
import { num } from "@/lib/invoice/money";
import { ERASURE_HOLD_DAYS } from "@/lib/privacy/erase";
import { listPrivateObjects, r2PrivateConfigured } from "@/lib/r2";

/**
 * Sage's app-side reads (two-pass contract). The engine routes a question to one
 * of these tools and returns `needs_app_data`; the admin-guarded `/api/sage`
 * relay runs the read here and sends the result back so the answer is grounded
 * on live data. Read-only and small. `resolveSageAppRead` runs for admins
 * only; staff go through `resolveStaffSageAppRead` (assigned requests, no money).
 */
export type AppReadRequest = {
  tool: string;
  slots?: Record<string, unknown>;
  client_id?: string | null;
};

const CLOSED = ["completed", "cancelled", "declined", "refunded"];
const UNPAID = ["sent", "viewed", "overdue", "partially_paid"];
const DAY = 86_400_000;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

async function clientInvoiceIds(clientId: string): Promise<string[]> {
  const rows = await db.select({ id: invoice.id }).from(invoice).where(eq(invoice.clientId, clientId));
  return rows.map((r) => r.id);
}

async function billingStatus(clientId: string | null) {
  const today = new Date().toISOString().slice(0, 10);
  const invIds = clientId ? await clientInvoiceIds(clientId) : null;
  if (invIds && !invIds.length) return { pending_transfers: [], overdue_invoices: [], note: "This client has no invoices." };
  const scopeInv = invIds ? inArray(invoice.id, invIds) : undefined;
  const scopePay = invIds ? inArray(payment.invoiceId, invIds) : undefined;

  const [proofs, unpaid, received] = await Promise.all([
    db
      .select({ p: payment, number: invoice.number, payer: sql<string>`coalesce(${invoice.billToCompany}, ${invoice.billToName})` })
      .from(payment)
      .leftJoin(invoice, eq(invoice.id, payment.invoiceId))
      .where(and(proofPending(), scopePay))
      .orderBy(asc(payment.createdAt))
      .limit(50),
    db
      .select()
      .from(invoice)
      .where(and(isNull(invoice.deletedAt), eq(invoice.kind, "invoice"), inArray(invoice.status, UNPAID), scopeInv))
      .orderBy(asc(invoice.dueDate))
      .limit(500),
    db
      .select({ total: sql<string>`coalesce(sum(coalesce(${payment.amountSettled}, ${payment.amount})), 0)`, n: sql<number>`count(*)` })
      .from(payment)
      .where(and(eq(payment.status, "success"), gte(payment.paidAt, new Date(Date.now() - 30 * DAY)), scopePay)),
  ]);

  const owed = unpaid.map((i) => ({
    number: i.number,
    client: i.billToCompany || i.billToName || "No client",
    due_date: i.dueDate,
    balance: Math.max(0, num(i.total) - num(i.amountPaid)),
    part_paid: num(i.amountPaid) > 0,
    overdue: Boolean(i.dueDate && i.dueDate < today),
  }));
  const overdue = owed.filter((o) => o.overdue);
  return {
    pending_transfers_count: proofs.length,
    pending_transfers: proofs.slice(0, 10).map(({ p, number, payer }) => ({
      invoice: number,
      payer: payer || "Unknown payer",
      amount_client_says: num(p.amount),
      uploaded_at: iso(p.createdAt),
      proof_file: p.proofFileName,
    })),
    unpaid_invoices_count: owed.length,
    total_owed: owed.reduce((s, o) => s + o.balance, 0),
    overdue_count: overdue.length,
    overdue_total: overdue.reduce((s, o) => s + o.balance, 0),
    overdue_invoices: overdue.slice(0, 10),
    part_paid_count: owed.filter((o) => o.part_paid).length,
    received_last_30_days: { total: num(received[0]?.total ?? 0), payments: Number(received[0]?.n ?? 0) },
    where: "Billing → Payments (To confirm) and Billing → Invoices",
  };
}

function scheduledFor(requestedAt: Date | null) {
  return requestedAt ? new Date(requestedAt.getTime() + ERASURE_HOLD_DAYS * DAY).toISOString() : null;
}

async function clientPrivacy(clientId: string | null) {
  if (clientId) {
    const [c] = await db.select().from(client).where(eq(client.id, clientId)).limit(1);
    if (!c) return { error: "That client was not found." };
    return {
      client: c.company || c.name,
      ai_mode: c.aiMode,
      ai_mode_reason: c.aiModeReason,
      ai_mode_set_by: c.aiModeSetBy,
      ai_mode_set_at: iso(c.aiModeSetAt),
      erasure_requested_at: iso(c.erasureRequestedAt),
      erasure_scheduled_for: c.erasedAt ? null : scheduledFor(c.erasureRequestedAt),
      erased_at: iso(c.erasedAt),
      hold_days: ERASURE_HOLD_DAYS,
      where: "Clients → the client → Privacy tab",
    };
  }
  const [local, pending] = await Promise.all([
    db.select({ name: client.name, company: client.company }).from(client)
      .where(and(eq(client.aiMode, "local_only"), isNull(client.deletedAt), isNull(client.erasedAt))).limit(50),
    db.select({ name: client.name, company: client.company, at: client.erasureRequestedAt }).from(client)
      .where(and(isNotNull(client.erasureRequestedAt), isNull(client.erasedAt))).orderBy(asc(client.erasureRequestedAt)).limit(50),
  ]);
  return {
    local_only_clients: local.map((c) => c.company || c.name),
    erasure_pending: pending.map((c) => ({ client: c.company || c.name, requested_at: iso(c.at), scheduled_for: scheduledFor(c.at) })),
    hold_days: ERASURE_HOLD_DAYS,
    where: "Clients (Erasure pending view) and each client's Privacy tab",
  };
}

async function assigneesFor(requestIds: string[]) {
  if (!requestIds.length) return new Map<string, string[]>();
  const rows = await db
    .select({ requestId: requestAssignment.requestId, name: user.name })
    .from(requestAssignment)
    .innerJoin(user, eq(user.id, requestAssignment.userId))
    .where(inArray(requestAssignment.requestId, requestIds));
  const out = new Map<string, string[]>();
  for (const r of rows) out.set(r.requestId, [...(out.get(r.requestId) ?? []), r.name]);
  return out;
}

/**
 * `onlyIds` (staff): the read is limited to these request ids. A request
 * outside them reads as not found, and the result carries no money fields.
 */
async function requestWork(requestNumber: string | null, clientId: string | null, onlyIds?: string[]) {
  if (onlyIds && !onlyIds.length) return { active_count: 0, note: "No requests are assigned to you yet.", where: "My requests" };
  const scopeIds = onlyIds ? inArray(serviceRequest.id, onlyIds) : undefined;
  if (requestNumber) {
    const [r] = await db.select().from(serviceRequest)
      .where(and(eq(serviceRequest.number, requestNumber), isNull(serviceRequest.deletedAt), scopeIds)).limit(1);
    if (!r) return { error: onlyIds ? `${requestNumber} is not one of your assigned requests.` : `No request ${requestNumber} found.` };
    const [asks, rounds, people] = await Promise.all([
      db.select().from(requestItem).where(eq(requestItem.requestId, r.id)).orderBy(desc(requestItem.createdAt)).limit(30),
      db.select().from(reviewRound).where(eq(reviewRound.requestId, r.id)).orderBy(asc(reviewRound.round)),
      assigneesFor([r.id]),
    ]);
    return {
      request: r.number,
      service: r.serviceName,
      status: r.status,
      assigned_to: people.get(r.id) ?? [],
      open_asks: asks.filter((a) => a.status === "open" || a.status === "supplied").map((a) => ({
        title: a.title, kind: a.kind, status: a.status, due: iso(a.dueAt),
      })),
      asks_received: asks.filter((a) => a.status === "received").length,
      review_rounds: rounds.map((x) => ({ round: x.round, sent_at: iso(x.sentAt), decision: x.decision ?? "pending", decided_at: iso(x.decidedAt) })),
      current_round: r.reviewRound,
      where: `Requests → ${r.number}`,
    };
  }
  const active = await db
    .select({ id: serviceRequest.id, number: serviceRequest.number, status: serviceRequest.status, service: serviceRequest.serviceName })
    .from(serviceRequest)
    .where(and(isNull(serviceRequest.deletedAt), notInArray(serviceRequest.status, CLOSED), clientId ? eq(serviceRequest.clientId, clientId) : undefined, scopeIds))
    .orderBy(desc(serviceRequest.createdAt))
    .limit(300);
  const ids = active.map((r) => r.id);
  const [people, openAsks] = await Promise.all([
    assigneesFor(ids),
    ids.length
      ? db.select({ requestId: requestItem.requestId, n: sql<number>`count(*)` }).from(requestItem)
          .where(and(inArray(requestItem.requestId, ids), eq(requestItem.status, "open"))).groupBy(requestItem.requestId)
      : Promise.resolve([] as { requestId: string; n: number }[]),
  ]);
  const asksBy = new Map(openAsks.map((a) => [a.requestId, Number(a.n)]));
  const waitingOnClient = active.filter((r) => (asksBy.get(r.id) ?? 0) > 0 || ["client_review", "awaiting_documents", "pending_payment"].includes(r.status));
  const unassigned = active.filter((r) => !(people.get(r.id) ?? []).length);
  return {
    active_count: active.length,
    unassigned_count: unassigned.length,
    unassigned: unassigned.slice(0, 15).map((r) => ({ request: r.number, service: r.service, status: r.status })),
    waiting_on_client_count: waitingOnClient.length,
    waiting_on_client: waitingOnClient.slice(0, 15).map((r) => ({ request: r.number, status: r.status, open_asks: asksBy.get(r.id) ?? 0 })),
    where: "Requests (views by whose move)",
  };
}

async function backupStatus() {
  const [objects, [lastTest]] = await Promise.all([
    r2PrivateConfigured ? listPrivateObjects("backups/db/").catch(() => []) : Promise.resolve([]),
    db.select().from(auditLog)
      .where(and(eq(auditLog.entity, "backup"), eq(auditLog.action, "backup.restore_test")))
      .orderBy(desc(auditLog.createdAt)).limit(1),
  ]);
  const newest = [...objects].sort((a, b) => (b.lastModified || "").localeCompare(a.lastModified || ""))[0];
  const meta = (lastTest?.meta ?? {}) as { pass?: boolean; seconds?: number; error?: string; failed?: string[]; tables?: number };
  return {
    storage_configured: r2PrivateConfigured,
    backups_kept: objects.length,
    last_backup_at: newest?.lastModified ?? null,
    last_restore_test: lastTest
      ? { at: lastTest.createdAt.toISOString(), passed: Boolean(meta.pass), seconds: meta.seconds ?? null, tables: meta.tables ?? null, failed_tables: meta.failed ?? [], error: meta.error ?? null }
      : null,
    where: "Settings → Backups",
  };
}

/**
 * Staff read: ONLY request_work, ONLY over the staff member's assigned
 * requests (ids resolved on the server from request_assignment), and with no
 * client filter. Billing, privacy and backup reads are never run for staff.
 */
export async function resolveStaffSageAppRead(req: AppReadRequest, assignedIds: string[]): Promise<Record<string, unknown>> {
  if (req.tool !== "request_work") return { error: "Only an admin can see that." };
  const n = req.slots?.request_number;
  return requestWork(typeof n === "string" && /^REQ-\d{4}-\d+$/.test(n) ? n : null, null, assignedIds);
}

export async function resolveSageAppRead(req: AppReadRequest): Promise<Record<string, unknown>> {
  const clientId = req.client_id ?? null;
  switch (req.tool) {
    case "billing_status":
      return billingStatus(clientId);
    case "client_privacy":
      return clientPrivacy(clientId);
    case "request_work": {
      const n = req.slots?.request_number;
      return requestWork(typeof n === "string" && /^REQ-\d{4}-\d+$/.test(n) ? n : null, clientId);
    }
    case "backup_status":
      return backupStatus();
    default:
      return { error: `Sage can't read "${req.tool}" yet.` };
  }
}
