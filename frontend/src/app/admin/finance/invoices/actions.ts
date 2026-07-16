"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoice, invoiceItem, client, serviceRequest, serviceRequestEvent, payment } from "@/lib/db/schema";
import { isAdmin, getCurrentUserId } from "@/lib/server-user";
import { computeTotals } from "@/lib/invoice/money";
import { nextInvoiceNumber, getInvoice } from "@/lib/db/queries/invoices";
import type { InvoiceInput, BillTo } from "@/lib/invoice/types";

type ActionResult = { ok: boolean; id?: string; error?: string };

function baseUrl() {
  return (
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://litchconsulting.com"
  ).replace(/\/$/, "");
}

async function requireAdmin(): Promise<string | null> {
  if (!(await isAdmin())) return null;
  return getCurrentUserId();
}

/** Create or update an invoice (draft-safe). Totals are recomputed here. */
export async function saveInvoiceAction(input: InvoiceInput): Promise<ActionResult> {
  const uid = await requireAdmin();
  if (!uid) return { ok: false, error: "Unauthorized" };

  const totals = computeTotals(input.items);
  const items = input.items.map((it, i) => ({
    description: it.description || "Item",
    detail: it.detail || null,
    quantity: String(it.quantity ?? 1),
    unitPrice: String(it.unitPrice ?? 0),
    taxRate: String(it.taxRate ?? 0),
    amount: String(totals.lines[i]?.amount ?? 0),
    position: i,
  }));

  const fields = {
    status: input.status ?? "draft",
    clientId: input.clientId || null,
    billToName: input.billTo.name || null,
    billToCompany: input.billTo.company || null,
    billToEmail: input.billTo.email || null,
    billToAddress: input.billTo.address || null,
    billToTaxId: input.billTo.taxId || null,
    projectTitle: input.projectTitle || null,
    currency: input.currency || "NGN",
    issueDate: input.issueDate,
    dueDate: input.dueDate || null,
    notes: input.notes || null,
    terms: input.terms || null,
    subtotal: String(totals.subtotal),
    taxTotal: String(totals.taxTotal),
    total: String(totals.total),
    updatedAt: new Date(),
  };

  const id = await db.transaction(async (tx) => {
    if (input.id) {
      await tx.update(invoice).set(fields).where(eq(invoice.id, input.id));
      await tx.delete(invoiceItem).where(eq(invoiceItem.invoiceId, input.id));
      if (items.length) await tx.insert(invoiceItem).values(items.map((it) => ({ ...it, invoiceId: input.id! })));
      return input.id;
    }
    const kind = input.kind === "quote" ? "quote" : "invoice";
    const number = input.number || (await nextInvoiceNumber(kind));
    const [row] = await tx
      .insert(invoice)
      .values({ ...fields, kind, number, publicToken: randomUUID(), createdByUserId: uid })
      .returning({ id: invoice.id });
    if (items.length) await tx.insert(invoiceItem).values(items.map((it) => ({ ...it, invoiceId: row.id })));
    return row.id;
  });

  // Auto-link to the service request this invoice was created for (first link
  // wins — re-pointing a request goes through the admin request panel).
  if (input.requestId) {
    const [req] = await db
      .select({ id: serviceRequest.id, invoiceId: serviceRequest.invoiceId, number: serviceRequest.number })
      .from(serviceRequest)
      .where(eq(serviceRequest.id, input.requestId));
    if (req && !req.invoiceId) {
      await db
        .update(serviceRequest)
        .set({ invoiceId: id, updatedAt: new Date() })
        .where(eq(serviceRequest.id, req.id));
      await db.insert(serviceRequestEvent).values({
        requestId: req.id,
        type: "invoice_linked",
        message: `Invoice created for this request.`,
        visibility: "internal",
        actorRole: "admin",
      });
      revalidatePath(`/admin/requests/${req.id}`);
      revalidatePath("/admin/requests");
    }
  }

  revalidatePath("/admin/finance/invoices");
  revalidatePath("/admin");
  return { ok: true, id };
}

/** True when the invoice is referenced by a service request or payment row. */
async function invoiceIsLinked(ids: string[]): Promise<string | null> {
  const [reqs, pays] = await Promise.all([
    db
      .select({ id: serviceRequest.id, number: serviceRequest.number })
      .from(serviceRequest)
      .where(inArray(serviceRequest.invoiceId, ids))
      .limit(1),
    db.select({ id: payment.id }).from(payment).where(inArray(payment.invoiceId, ids)).limit(1),
  ]);
  if (reqs.length) return `linked to service request ${reqs[0].number}`;
  if (pays.length) return "it has payment records";
  return null;
}

export async function deleteInvoiceAction(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  const linked = await invoiceIsLinked([id]);
  if (linked) return { ok: false, error: `Can't delete — ${linked}. Void it instead.` };
  await db.transaction(async (tx) => {
    await tx.delete(invoiceItem).where(eq(invoiceItem.invoiceId, id));
    await tx.delete(invoice).where(eq(invoice.id, id));
  });
  revalidatePath("/admin/finance/invoices");
  return { ok: true };
}

export async function setInvoiceStatusAction(id: string, status: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  if (status === "paid") {
    // Manual mark-as-paid runs the same pipeline as a Paystack success:
    // amountPaid + paidAt + linked-request advance + receipt + admin alert.
    const [inv] = await db.select().from(invoice).where(eq(invoice.id, id));
    if (!inv) return { ok: false, error: "Not found" };
    if (inv.status !== "paid") {
      const { applyInvoicePaid } = await import("@/lib/payments/apply");
      await applyInvoicePaid(inv, { via: "manual" });
    }
  } else {
    const patch: Record<string, unknown> = { status, updatedAt: new Date() };
    await db.update(invoice).set(patch).where(eq(invoice.id, id));
    // Voiding an invoice that a request is waiting on reverts the request.
    if (status === "void") {
      const reqs = await db
        .select()
        .from(serviceRequest)
        .where(eq(serviceRequest.invoiceId, id));
      const req = reqs[0];
      if (req && req.status === "pending_payment") {
        const toStatus = req.pricingMode === "quote" ? "quote_requested" : "cancelled";
        await db
          .update(serviceRequest)
          .set({ status: toStatus, updatedAt: new Date() })
          .where(eq(serviceRequest.id, req.id));
        await db.insert(serviceRequestEvent).values({
          requestId: req.id,
          type: "status_changed",
          fromStatus: "pending_payment",
          toStatus,
          message: "The linked invoice was voided.",
          visibility: "client",
          actorRole: "admin",
        });
      }
    }
  }
  revalidatePath("/admin/finance/invoices");
  revalidatePath(`/admin/finance/invoices/${id}`);
  return { ok: true };
}

export async function duplicateInvoiceAction(id: string): Promise<ActionResult> {
  const uid = await requireAdmin();
  if (!uid) return { ok: false, error: "Unauthorized" };
  const data = await getInvoice(id);
  if (!data) return { ok: false, error: "Not found" };
  const { invoice: inv, items } = data;
  const number = await nextInvoiceNumber();
  const newId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(invoice)
      .values({
        number,
        status: "draft",
        clientId: inv.clientId,
        billToName: inv.billToName,
        billToCompany: inv.billToCompany,
        billToEmail: inv.billToEmail,
        billToAddress: inv.billToAddress,
        billToTaxId: inv.billToTaxId,
        projectTitle: inv.projectTitle,
        currency: inv.currency,
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate: inv.dueDate,
        notes: inv.notes,
        terms: inv.terms,
        subtotal: inv.subtotal,
        taxTotal: inv.taxTotal,
        total: inv.total,
        publicToken: randomUUID(),
        createdByUserId: uid,
      })
      .returning({ id: invoice.id });
    if (items.length)
      await tx.insert(invoiceItem).values(
        items.map((it) => ({
          invoiceId: row.id,
          description: it.description,
          detail: it.detail,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          taxRate: it.taxRate,
          amount: it.amount,
          position: it.position,
        })),
      );
    return row.id;
  });
  revalidatePath("/admin/finance/invoices");
  return { ok: true, id: newId };
}

/** Render the PDF, email the client, and mark the invoice sent. */
export async function sendInvoiceAction(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  const data = await getInvoice(id);
  if (!data) return { ok: false, error: "Not found" };
  const { invoice: inv, items } = data;
  if (!inv.billToEmail) return { ok: false, error: "Add a client email before sending." };

  const publicLink = `${baseUrl()}/i/${inv.publicToken}`;
  const invoiceData = {
    number: inv.number,
    status: inv.status,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    currency: inv.currency,
    projectTitle: inv.projectTitle,
    billTo: {
      name: inv.billToName || undefined,
      company: inv.billToCompany || undefined,
      email: inv.billToEmail || undefined,
      address: inv.billToAddress || undefined,
      taxId: inv.billToTaxId || undefined,
    },
    items: items.map((it) => ({
      description: it.description,
      detail: it.detail || undefined,
      quantity: Number(it.quantity),
      unitPrice: Number(it.unitPrice),
      taxRate: Number(it.taxRate),
    })),
    notes: inv.notes,
    terms: inv.terms,
    paymentUrl: publicLink,
  };

  const { renderInvoicePdf } = await import("@/lib/invoice/pdf/render");
  const { sendEmail, emailLayout } = await import("@/lib/email");
  const { getIssuer } = await import("@/lib/invoice/get-issuer");
  const pdf = await renderInvoicePdf(invoiceData, "invoice", await getIssuer());

  const payHref = publicLink;
  const html = emailLayout(`
    <p style="margin:0 0 14px;">Hi ${inv.billToName || "there"},</p>
    <p style="margin:0 0 18px;">Please find attached invoice <strong>${inv.number}</strong>${
      inv.projectTitle ? ` for <strong>${inv.projectTitle}</strong>` : ""
    }. You can view it online or pay using the button below.</p>
    <p style="margin:0 0 20px;"><a href="${payHref}" style="display:inline-block;background:#0a196d;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:9999px;">View &amp; pay invoice</a></p>
    <p style="margin:0;color:#5b6474;font-size:13px;">Or open the invoice here: <a href="${publicLink}" style="color:#2540c4;">${publicLink}</a></p>
  `);

  const { delivered } = await sendEmail({
    to: inv.billToEmail,
    subject: `Invoice ${inv.number} from Litch Consulting`,
    html,
    attachments: [{ filename: `${inv.number}.pdf`, content: pdf, contentType: "application/pdf" }],
  });

  await db.update(invoice).set({ status: "sent", sentAt: new Date(), updatedAt: new Date() }).where(eq(invoice.id, id));

  // Quote-based service request waiting on this invoice → the quote is out.
  const linkedRequests = await db
    .select({ id: serviceRequest.id, status: serviceRequest.status })
    .from(serviceRequest)
    .where(eq(serviceRequest.invoiceId, id));
  for (const req of linkedRequests) {
    if (req.status === "quote_requested") {
      const { markQuoteSent } = await import("@/lib/requests/quote");
      await markQuoteSent(req.id, inv.number);
      revalidatePath("/admin/requests");
      revalidatePath(`/admin/requests/${req.id}`);
      revalidatePath(`/dashboard/requests/${req.id}`);
    }
  }

  revalidatePath("/admin/finance/invoices");
  revalidatePath(`/admin/finance/invoices/${id}`);
  return { ok: true, error: delivered ? undefined : "Invoice marked sent (email not configured)." };
}

/** Convert an accepted quote into a draft invoice (marks the quote accepted). */
export async function convertQuoteToInvoiceAction(id: string): Promise<ActionResult> {
  const uid = await requireAdmin();
  if (!uid) return { ok: false, error: "Unauthorized" };
  const data = await getInvoice(id);
  if (!data || data.invoice.kind !== "quote") return { ok: false, error: "Not a quote" };
  const { invoice: q, items } = data;
  const number = await nextInvoiceNumber("invoice");
  const newId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(invoice)
      .values({
        number,
        kind: "invoice",
        status: "draft",
        clientId: q.clientId,
        billToName: q.billToName,
        billToCompany: q.billToCompany,
        billToEmail: q.billToEmail,
        billToAddress: q.billToAddress,
        billToTaxId: q.billToTaxId,
        projectTitle: q.projectTitle,
        currency: q.currency,
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate: q.dueDate,
        notes: q.notes,
        terms: q.terms,
        subtotal: q.subtotal,
        taxTotal: q.taxTotal,
        total: q.total,
        publicToken: randomUUID(),
        createdByUserId: uid,
      })
      .returning({ id: invoice.id });
    if (items.length)
      await tx.insert(invoiceItem).values(
        items.map((it) => ({
          invoiceId: row.id,
          description: it.description,
          detail: it.detail,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          taxRate: it.taxRate,
          amount: it.amount,
          position: it.position,
        })),
      );
    return row.id;
  });
  await db.update(invoice).set({ status: "accepted", updatedAt: new Date() }).where(eq(invoice.id, id));
  revalidatePath("/admin/finance/quotes");
  revalidatePath("/admin/finance/invoices");
  return { ok: true, id: newId };
}

/** Create a bill-to client from the builder's inline form. */
export async function createClientAction(input: BillTo): Promise<ActionResult & { client?: unknown }> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  if (!input.name && !input.company) return { ok: false, error: "Name or company required." };
  const [row] = await db
    .insert(client)
    .values({
      name: input.name || input.company || "Client",
      company: input.company || null,
      email: input.email || null,
      address: input.address || null,
      taxId: input.taxId || null,
    })
    .returning();
  revalidatePath("/admin/clients");
  return { ok: true, id: row.id, client: row };
}

/** Bulk delete invoices/quotes by IDs. */
export async function bulkDeleteInvoicesAction(ids: string[]): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  if (!ids || ids.length === 0) return { ok: true };

  try {
    const linked = await invoiceIsLinked(ids);
    if (linked) return { ok: false, error: `Can't delete — one is ${linked}. Void it instead.` };
    await db.transaction(async (tx) => {
      await tx.delete(invoiceItem).where(inArray(invoiceItem.invoiceId, ids));
      await tx.delete(invoice).where(inArray(invoice.id, ids));
    });
    revalidatePath("/admin/finance/invoices");
    revalidatePath("/admin/finance/quotes");
    revalidatePath("/admin/finance/receipts");
    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not delete invoices" };
  }
}

/** Bulk set status on invoices/quotes. */
export async function bulkSetInvoiceStatusAction(ids: string[], status: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  if (!ids || ids.length === 0) return { ok: true };

  try {
    if (status === "paid") {
      // Route each through the shared payment pipeline (idempotent per invoice).
      const { applyInvoicePaid } = await import("@/lib/payments/apply");
      const rows = await db.select().from(invoice).where(inArray(invoice.id, ids));
      for (const inv of rows) {
        if (inv.status !== "paid") await applyInvoicePaid(inv, { via: "manual" });
      }
    } else {
      await db
        .update(invoice)
        .set({ status, updatedAt: new Date() })
        .where(inArray(invoice.id, ids));
    }
    revalidatePath("/admin/finance/invoices");
    revalidatePath("/admin/finance/quotes");
    revalidatePath("/admin/finance/receipts");
    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not update status" };
  }
}

