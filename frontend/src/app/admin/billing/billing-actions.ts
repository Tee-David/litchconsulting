"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { client, invoice, payment, serviceRequest } from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notifications";
import { formatMoney, num } from "@/lib/invoice/money";
import { actor, DENIED } from "../_lib/guard";
import { recomputeInvoicePaid } from "../_lib/recompute";
import { remindInvoice } from "../attention-actions";

/*
 * Billing (R2.4): bank-transfer proofs, deposits and balance invoices, bulk
 * actions. Every action re-checks the billing area, validates with zod and
 * writes the audit log; clients hear about money through notifyUsers.
 */

type Res = { ok: true; message: string; id?: string } | { ok: false; error: string; id?: string };
const uuid = z.string().uuid();

function billingRevalidate(invoiceId?: string) {
  revalidatePath("/admin/billing");
  revalidatePath("/admin/billing/payments");
  revalidatePath("/admin");
  if (invoiceId) revalidatePath(`/admin/billing/invoices/${invoiceId}`);
  revalidatePath("/dashboard/invoices");
}

/** Who to tell on the client side about money on this invoice. */
async function clientUsersFor(inv: typeof invoice.$inferSelect): Promise<string[]> {
  const ids = new Set<string>();
  if (inv.clientId) {
    const [c] = await db.select({ userId: client.userId }).from(client).where(eq(client.id, inv.clientId)).limit(1);
    if (c?.userId) ids.add(c.userId);
  }
  const reqs = await db.select({ userId: serviceRequest.userId }).from(serviceRequest).where(eq(serviceRequest.invoiceId, inv.id));
  reqs.forEach((r) => ids.add(r.userId));
  return [...ids];
}

/** Short-lived link to view a transfer proof (private bucket). */
export async function proofUrlAction(paymentId: string): Promise<{ ok: true; url: string; name: string } | { ok: false; error: string }> {
  if (!(await actor("billing"))) return DENIED;
  if (!uuid.safeParse(paymentId).success) return { ok: false, error: "Unknown payment." };
  const [p] = await db.select().from(payment).where(eq(payment.id, paymentId)).limit(1);
  if (!p?.proofKey) return { ok: false, error: "This payment has no proof attached." };
  try {
    const { presignPrivateGet } = await import("@/lib/r2");
    const url = await presignPrivateGet(p.proofKey, { downloadName: p.proofFileName || "transfer-proof", expiresIn: 300 });
    return { ok: true, url, name: p.proofFileName || "Transfer proof" };
  } catch {
    return { ok: false, error: "File storage is not reachable, so the proof cannot be opened right now." };
  }
}

const confirmSchema = z.object({
  paymentId: uuid,
  amount: z.number().positive().max(1e12),
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).optional(),
});

/**
 * Confirm a client's bank-transfer proof: the payment becomes a success for
 * the amount actually received, the invoice's amount_paid/status is re-derived
 * (part paid, deposit paid or paid — the paid path emails the receipt and
 * moves the request on), and the client is told.
 */
export async function confirmTransferAction(input: z.infer<typeof confirmSchema>): Promise<Res> {
  const me = await actor("billing");
  if (!me) return DENIED;
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the amount and the date received." };
  const { paymentId, amount, receivedOn, note } = parsed.data;
  try {
    const [p] = await db.select().from(payment).where(eq(payment.id, paymentId)).limit(1);
    if (!p) return { ok: false, error: "This payment no longer exists." };
    if (p.confirmedAt || p.status === "success") return { ok: false, error: "This transfer was already confirmed." };
    if (p.status === "rejected") return { ok: false, error: "This transfer was marked as not matching. Ask the client to upload a new proof." };
    const now = new Date();
    const claimed = await db
      .update(payment)
      .set({
        status: "success",
        amountSettled: amount.toFixed(2),
        paidAt: new Date(`${receivedOn}T12:00:00Z`),
        verifiedAt: now,
        confirmedAt: now,
        confirmedBy: me.id,
        rawEvent: { ...((p.rawEvent as object) ?? {}), confirmNote: note || null, confirmedByName: me.displayName },
        updatedAt: now,
      })
      .where(and(eq(payment.id, p.id), isNull(payment.confirmedAt)))
      .returning({ id: payment.id });
    if (!claimed[0]) return { ok: false, error: "Someone else just confirmed this transfer." };

    await recomputeInvoicePaid(p.invoiceId);
    const [inv] = await db.select().from(invoice).where(eq(invoice.id, p.invoiceId)).limit(1);
    await recordAudit({
      action: "payment.transfer_confirmed",
      entity: "payment",
      entityId: p.id,
      meta: { invoice: inv?.number, amount, claimed: num(p.amount), receivedOn },
    });

    if (inv) {
      const bal = Math.max(0, num(inv.total) - num(inv.amountPaid));
      await notifyUsers({
        userIds: await clientUsersFor(inv),
        category: "billing",
        title: `We received your transfer of ${formatMoney(amount, inv.currency)}`,
        body: inv.status === "paid" ? `${inv.number} is paid in full. Your receipt is in Billing.` : `Applied to ${inv.number}. ${formatMoney(bal, inv.currency)} is still to pay.`,
        link: "/dashboard/invoices",
        dedupeKey: `transfer-confirmed:${p.id}`,
      });
    }
    billingRevalidate(p.invoiceId);
    return {
      ok: true,
      message: inv?.status === "paid" ? `Confirmed. ${inv.number} is paid and the receipt was sent.` : `Confirmed. ${inv?.number ?? "The invoice"} is part paid.`,
    };
  } catch (e) {
    console.error("[billing] confirm transfer", e);
    return { ok: false, error: "The transfer could not be confirmed. Try again." };
  }
}

const rejectSchema = z.object({ paymentId: uuid, reason: z.string().trim().min(3).max(500) });

/** The proof does not match: mark it rejected and tell the client why. */
export async function rejectTransferAction(input: z.infer<typeof rejectSchema>): Promise<Res> {
  const me = await actor("billing");
  if (!me) return DENIED;
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Say why, in a sentence the client understands." };
  try {
    const [p] = await db.select().from(payment).where(eq(payment.id, parsed.data.paymentId)).limit(1);
    if (!p) return { ok: false, error: "This payment no longer exists." };
    if (p.confirmedAt || p.status === "success") return { ok: false, error: "This transfer is already confirmed." };
    await db
      .update(payment)
      .set({ status: "rejected", rawEvent: { ...((p.rawEvent as object) ?? {}), rejectReason: parsed.data.reason, rejectedBy: me.displayName }, updatedAt: new Date() })
      .where(eq(payment.id, p.id));
    const [inv] = await db.select().from(invoice).where(eq(invoice.id, p.invoiceId)).limit(1);
    await recordAudit({ action: "payment.transfer_rejected", entity: "payment", entityId: p.id, meta: { invoice: inv?.number, reason: parsed.data.reason } });
    if (inv) {
      await notifyUsers({
        userIds: await clientUsersFor(inv),
        category: "actions",
        title: `We could not match your transfer for ${inv.number}`,
        body: parsed.data.reason,
        link: "/dashboard/invoices",
        dedupeKey: `transfer-rejected:${p.id}`,
      });
    }
    billingRevalidate(p.invoiceId);
    return { ok: true, message: "Marked as not matching. The client was told why." };
  } catch (e) {
    console.error("[billing] reject transfer", e);
    return { ok: false, error: "That did not save. Try again." };
  }
}

const depositSchema = z.object({ invoiceId: uuid, percent: z.number().int().min(10).max(90).nullable() });

/** Ask for a deposit (percent due up front) on an invoice or quote, or remove it. A quote carries it to its invoice. */
export async function setDepositAction(input: z.infer<typeof depositSchema>): Promise<Res> {
  const me = await actor("billing");
  if (!me) return DENIED;
  const parsed = depositSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "A deposit is between 10% and 90%." };
  const [inv] = await db.select().from(invoice).where(eq(invoice.id, parsed.data.invoiceId)).limit(1);
  if (!inv) return { ok: false, error: "Document not found." };
  if (num(inv.amountPaid) > 0) return { ok: false, error: "Money has already been paid on this invoice, so its terms are fixed." };
  if (inv.parentInvoiceId) return { ok: false, error: "A balance invoice cannot also be a deposit invoice." };
  await db.update(invoice).set({ depositPercent: parsed.data.percent, updatedAt: new Date() }).where(eq(invoice.id, inv.id));
  await recordAudit({ action: "invoice.deposit_set", entity: "invoice", entityId: inv.id, meta: { number: inv.number, percent: parsed.data.percent } });
  billingRevalidate(inv.id);
  return { ok: true, message: parsed.data.percent ? `${inv.number} now asks for a ${parsed.data.percent}% deposit.` : `${inv.number} is a normal invoice again.`, id: inv.id };
}

/**
 * Generate the balance invoice for a deposit invoice: one line for what is
 * left of the job, linked by parent_invoice_id. VAT was charged on the full
 * fee on the deposit invoice, so the balance line carries no new VAT.
 */
export async function createBalanceInvoiceAction(depositInvoiceId: string): Promise<Res> {
  const me = await actor("billing");
  if (!me) return DENIED;
  if (!uuid.safeParse(depositInvoiceId).success) return { ok: false, error: "Unknown invoice." };
  const [dep] = await db.select().from(invoice).where(eq(invoice.id, depositInvoiceId)).limit(1);
  if (!dep || !dep.depositPercent) return { ok: false, error: "This is not a deposit invoice." };
  const [existing] = await db
    .select({ id: invoice.id, number: invoice.number })
    .from(invoice)
    .where(and(eq(invoice.parentInvoiceId, dep.id), isNull(invoice.deletedAt)))
    .limit(1);
  if (existing) return { ok: false, error: `The balance invoice already exists: ${existing.number}.`, id: existing.id };
  const remaining = Math.round((num(dep.total) - num(dep.amountPaid)) * 100) / 100;
  if (remaining <= 0) return { ok: false, error: "Nothing is left to bill on this job." };
  try {
    const { insertInvoiceWithItems } = await import("@/lib/invoice/persist");
    const due = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const created = await insertInvoiceWithItems({
      kind: "invoice",
      status: "draft",
      clientId: dep.clientId,
      billTo: { name: dep.billToName, company: dep.billToCompany, email: dep.billToEmail, address: dep.billToAddress, taxId: dep.billToTaxId },
      projectTitle: dep.projectTitle,
      currency: dep.currency,
      dueDate: due,
      notes: `Balance of ${dep.number} (${100 - dep.depositPercent}% of the job). VAT was charged on the full fee on ${dep.number}.`,
      terms: dep.terms,
      items: [
        {
          description: `Balance for ${dep.projectTitle || dep.number}`,
          detail: `Remaining ${100 - dep.depositPercent}% of ${dep.number}, VAT included`,
          quantity: 1,
          unitPrice: remaining,
          taxRate: 0,
        },
      ],
      createdByUserId: me.id,
    });
    await db.update(invoice).set({ parentInvoiceId: dep.id }).where(eq(invoice.id, created.id));
    await recordAudit({ action: "invoice.balance_created", entity: "invoice", entityId: created.id, meta: { number: created.number, parent: dep.number, amount: remaining } });
    billingRevalidate(dep.id);
    return { ok: true, message: `Balance invoice ${created.number} created as a draft. Check it, then send it.`, id: created.id };
  } catch (e) {
    console.error("[billing] balance invoice", e);
    return { ok: false, error: "The balance invoice could not be created. Try again." };
  }
}

/** Bulk: reminder email for each unpaid invoice with an address (once a day each). */
export async function bulkRemindInvoicesAction(ids: string[]): Promise<Res> {
  if (!(await actor("billing"))) return DENIED;
  const parsed = z.array(uuid).min(1).max(200).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Select up to 200 invoices." };
  let sent = 0;
  const skipped: string[] = [];
  for (const id of parsed.data) {
    const r = await remindInvoice(`overdue:${id}`);
    if (r.ok) sent++;
    else skipped.push(r.error);
  }
  billingRevalidate();
  if (!sent) return { ok: false, error: skipped[0] ?? "No reminders sent." };
  return { ok: true, message: `${sent} reminder${sent === 1 ? "" : "s"} sent${skipped.length ? `, ${skipped.length} skipped` : ""}.` };
}

/** Bulk: move drafts / void documents with no money on them to Trash. */
export async function bulkTrashDocsAction(ids: string[]): Promise<Res> {
  if (!(await actor("billing"))) return DENIED;
  const parsed = z.array(uuid).min(1).max(200).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Select up to 200 documents." };
  const rows = await db.select().from(invoice).where(inArray(invoice.id, parsed.data));
  const ok = rows.filter((r) => ["draft", "void", "declined", "expired"].includes(r.status) && num(r.amountPaid) === 0);
  if (!ok.length) return { ok: false, error: "Only drafts and void documents with no payments can go to Trash. Void the others first." };
  await db.update(invoice).set({ deletedAt: new Date() }).where(inArray(invoice.id, ok.map((r) => r.id)));
  await recordAudit({ action: "invoice.trashed", entity: "invoice", meta: { numbers: ok.map((r) => r.number) } });
  billingRevalidate();
  revalidatePath("/admin/trash");
  return { ok: true, message: `${ok.length} moved to Trash${ok.length < rows.length ? `, ${rows.length - ok.length} kept (sent or paid)` : ""}.` };
}

/** Bulk: void sent invoices / quotes (paid ones are refused). */
export async function bulkVoidDocsAction(ids: string[]): Promise<Res> {
  if (!(await actor("billing"))) return DENIED;
  const parsed = z.array(uuid).min(1).max(200).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Select up to 200 documents." };
  const rows = await db.select().from(invoice).where(inArray(invoice.id, parsed.data));
  const ok = rows.filter((r) => num(r.amountPaid) === 0 && !["paid", "void"].includes(r.status));
  if (!ok.length) return { ok: false, error: "Nothing to void: paid and part-paid documents cannot be voided." };
  await db.update(invoice).set({ status: "void", updatedAt: new Date() }).where(inArray(invoice.id, ok.map((r) => r.id)));
  await recordAudit({ action: "invoice.bulk_voided", entity: "invoice", meta: { numbers: ok.map((r) => r.number) } });
  billingRevalidate();
  return { ok: true, message: `${ok.length} voided${ok.length < rows.length ? `, ${rows.length - ok.length} kept (money received)` : ""}.` };
}
