"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { invoice, payment } from "@/lib/db/schema";
import { recordAudit } from "@/lib/audit";
import { confirmTransferPayment, rejectTransferPayment } from "@/lib/payments/bank-transfer";
import { num } from "@/lib/invoice/money";
import { actor, DENIED } from "../_lib/guard";
import { remindInvoice } from "../attention-actions";

/*
 * Billing (R2.4): bank-transfer proofs, deposit terms, bulk
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

/** Short-lived link to view a transfer proof (private bucket). */
export async function proofUrlAction(paymentId: string): Promise<{ ok: true; url: string; name: string } | { ok: false; error: string }> {
  if (!(await actor("billing"))) return DENIED;
  if (!uuid.safeParse(paymentId).success) return { ok: false, error: "Unknown payment." };
  const [p] = await db.select().from(payment).where(eq(payment.id, paymentId)).limit(1);
  if (!p?.proofKey) return { ok: false, error: "This payment has no proof attached." };
  const { downloadBlock, ensureProofScanned } = await import("@/lib/uploads/scan");
  const blocked = downloadBlock(await ensureProofScanned({ id: p.id, proofKey: p.proofKey, proofFileName: p.proofFileName, proofScanStatus: p.proofScanStatus }), "firm");
  if (blocked) return { ok: false, error: blocked };
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
 * Confirm a client's bank-transfer proof through the shared money path
 * (lib/payments/bank-transfer.ts): the payment becomes a success for the
 * amount that actually landed, the invoice goes part paid (deposit) or paid
 * (receipt), the request moves on and the client is told there.
 */
export async function confirmTransferAction(input: z.infer<typeof confirmSchema>): Promise<Res> {
  const me = await actor("billing");
  if (!me) return DENIED;
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the amount and the date received." };
  const { paymentId, amount, receivedOn, note } = parsed.data;
  try {
    const [p] = await db.select({ invoiceId: payment.invoiceId }).from(payment).where(eq(payment.id, paymentId)).limit(1);
    if (!p) return { ok: false, error: "This payment no longer exists." };
    const r = await confirmTransferPayment(paymentId, { id: me.id, name: me.displayName }, { amount, receivedOn, note });
    if (!r.ok) return { ok: false, error: r.error };
    const [inv] = await db.select({ number: invoice.number, status: invoice.status }).from(invoice).where(eq(invoice.id, p.invoiceId)).limit(1);
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

/** The proof does not match: shared path marks it rejected and tells the client why. */
export async function rejectTransferAction(input: z.infer<typeof rejectSchema>): Promise<Res> {
  const me = await actor("billing");
  if (!me) return DENIED;
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Say why, in a sentence the client understands." };
  try {
    const [p] = await db.select({ invoiceId: payment.invoiceId }).from(payment).where(eq(payment.id, parsed.data.paymentId)).limit(1);
    if (!p) return { ok: false, error: "This payment no longer exists." };
    const r = await rejectTransferPayment(parsed.data.paymentId, { id: me.id, name: me.displayName }, parsed.data.reason);
    if (!r.ok) return { ok: false, error: r.error };
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
  const me = await actor("billing");
  if (!me) return DENIED;
  const parsed = z.array(uuid).min(1).max(200).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Select up to 200 documents." };
  const rows = await db.select().from(invoice).where(inArray(invoice.id, parsed.data));
  const ok = rows.filter((r) => ["draft", "void", "declined", "expired"].includes(r.status) && num(r.amountPaid) === 0);
  if (!ok.length) return { ok: false, error: "Only drafts and void documents with no payments can go to Trash. Void the others first." };
  await db.update(invoice).set({ deletedAt: new Date(), deletedBy: me.displayName }).where(inArray(invoice.id, ok.map((r) => r.id)));
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
