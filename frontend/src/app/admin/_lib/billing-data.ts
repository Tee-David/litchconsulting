import "server-only";
import { and, desc, eq, isNotNull, isNull, like, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { client, emailOutbox, invoice, payment, serviceRequest } from "@/lib/db/schema";
import { num } from "@/lib/invoice/money";
import { isLateInvoice, lagosToday, outstanding } from "@/lib/invoice/late";
import { proofPending } from "@/lib/attention/admin";

export type BillingDoc = {
  id: string;
  number: string;
  kind: "quote" | "invoice";
  /** deposit = has deposit_percent · balance = has parent_invoice_id */
  role: "deposit" | "balance" | null;
  depositPercent: number | null;
  status: string; // stored status, with "overdue" derived for unpaid past-due invoices
  client: string;
  email: string | null;
  requestId: string | null;
  requestNumber: string | null;
  issueDate: string;
  dueDate: string | null;
  total: number;
  paid: number;
  balance: number;
  /** Late by the shared definition in lib/invoice/late.ts (part-paid past due counts). */
  late: boolean;
  currency: string;
  title: string | null;
  /** The receipt email for this invoice (outbox row `receipt:<id>`), or null when none was queued. */
  receipt: "queued" | "sent" | "failed" | "skipped" | null;
};

export async function listBillingDocs(): Promise<BillingDoc[]> {
  const today = lagosToday();
  const rows = await db
    .select({
      inv: invoice,
      reqId: serviceRequest.id,
      reqNumber: serviceRequest.number,
    })
    .from(invoice)
    .leftJoin(serviceRequest, and(eq(serviceRequest.invoiceId, invoice.id), isNull(serviceRequest.deletedAt)))
    .where(isNull(invoice.deletedAt))
    .orderBy(desc(invoice.createdAt))
    .limit(2000);
  // Receipt emails are sent through the outbox with dedupe key `receipt:<invoice id>`
  // (lib/payments/apply.ts), so the outbox row is the real receipt state.
  const receiptRows = await db
    .select({ key: emailOutbox.dedupeKey, status: emailOutbox.status })
    .from(emailOutbox)
    .where(like(emailOutbox.dedupeKey, "receipt:%"));
  const receiptOf = new Map(receiptRows.map((r) => [r.key.slice("receipt:".length), r.status as BillingDoc["receipt"]]));
  return rows.map(({ inv, reqId, reqNumber }) => {
    const total = num(inv.total);
    const paid = num(inv.amountPaid);
    const late = isLateInvoice(inv, today);
    return {
      id: inv.id,
      number: inv.number,
      kind: inv.kind === "quote" ? "quote" : "invoice",
      role: inv.depositPercent ? "deposit" : inv.parentInvoiceId ? "balance" : null,
      depositPercent: inv.depositPercent,
      status: late && inv.status !== "partially_paid" ? "overdue" : inv.status,
      client: inv.billToCompany || inv.billToName || "No client",
      email: inv.billToEmail,
      requestId: reqId,
      requestNumber: reqNumber,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      total,
      paid,
      balance: inv.kind === "invoice" && !["void", "draft"].includes(inv.status) ? outstanding(total, paid) : 0,
      late,
      currency: inv.currency,
      title: inv.projectTitle,
      receipt: receiptOf.get(inv.id) ?? null,
    } satisfies BillingDoc;
  });
}

export type PaymentLine = {
  id: string;
  reference: string;
  provider: string;
  channel: string | null;
  status: string; // proof | success | failed | rejected | …
  amount: number;
  currency: string;
  at: string;
  invoiceId: string;
  invoiceNumber: string | null;
  payer: string;
  proofFileName: string | null;
  hasProof: boolean;
  confirmedAt: string | null;
  note: string | null;
  invoiceTotal: number;
  invoiceBalance: number;
  depositDue: number | null;
  requestId: string | null;
  requestNumber: string | null;
};

export async function listPaymentLines(): Promise<PaymentLine[]> {
  const rows = await db
    .select({ p: payment, inv: invoice, c: client, reqId: serviceRequest.id, reqNumber: serviceRequest.number })
    .from(payment)
    .leftJoin(invoice, eq(invoice.id, payment.invoiceId))
    .leftJoin(client, eq(client.id, payment.clientId))
    .leftJoin(serviceRequest, eq(serviceRequest.invoiceId, payment.invoiceId))
    .where(ne(payment.status, "initialized"))
    .orderBy(desc(sql`coalesce(${payment.paidAt}, ${payment.createdAt})`))
    .limit(2000);
  return rows.map(({ p, inv, c, reqId, reqNumber }) => {
    const pending = Boolean(p.proofKey) && !p.confirmedAt && !["rejected", "success"].includes(p.status);
    const raw = (p.rawEvent ?? null) as { note?: string } | null;
    return {
      id: p.id,
      reference: p.reference,
      provider: p.provider,
      channel: p.channel,
      status: pending ? "proof" : p.status === "success" && p.proofKey ? "confirmed" : p.status,
      amount: num(p.amountSettled ?? p.amount),
      currency: p.currency,
      at: new Date(p.paidAt ?? p.createdAt).toISOString(),
      invoiceId: p.invoiceId,
      invoiceNumber: inv?.number ?? null,
      payer: inv?.billToCompany || inv?.billToName || c?.company || c?.name || "Unknown payer",
      proofFileName: p.proofFileName,
      hasProof: Boolean(p.proofKey),
      confirmedAt: p.confirmedAt ? p.confirmedAt.toISOString() : null,
      note: typeof raw?.note === "string" ? raw.note : null,
      invoiceTotal: inv ? num(inv.total) : 0,
      invoiceBalance: inv ? Math.max(0, num(inv.total) - num(inv.amountPaid)) : 0,
      depositDue: inv?.depositPercent ? Math.round(num(inv.total) * inv.depositPercent) / 100 : null,
      requestId: reqId,
      requestNumber: reqNumber,
    };
  });
}

/** Everything the proof sheet needs to decide: payment, invoice, request. */
export async function proofDetail(paymentId: string) {
  const [row] = await db
    .select({ p: payment, inv: invoice })
    .from(payment)
    .leftJoin(invoice, eq(invoice.id, payment.invoiceId))
    .where(eq(payment.id, paymentId))
    .limit(1);
  if (!row) return null;
  const [req] = row.inv
    ? await db.select({ id: serviceRequest.id, number: serviceRequest.number, status: serviceRequest.status }).from(serviceRequest).where(eq(serviceRequest.invoiceId, row.inv.id)).limit(1)
    : [];
  return { payment: row.p, invoice: row.inv, request: req ?? null };
}

export async function proofCount(): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(payment).where(and(proofPending(), isNotNull(payment.invoiceId)));
  return Number(r?.n ?? 0);
}
