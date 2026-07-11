"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { inArray } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoice, invoiceItem, client } from "@/lib/db/schema";
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
    paymentUrl: input.paymentUrl || null,
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

  revalidatePath("/admin/finance/invoices");
  revalidatePath("/admin");
  return { ok: true, id };
}

export async function deleteInvoiceAction(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  await db.transaction(async (tx) => {
    await tx.delete(invoiceItem).where(eq(invoiceItem.invoiceId, id));
    await tx.delete(invoice).where(eq(invoice.id, id));
  });
  revalidatePath("/admin/finance/invoices");
  return { ok: true };
}

export async function setInvoiceStatusAction(id: string, status: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  const patch: Record<string, unknown> = { status, updatedAt: new Date() };
  if (status === "paid") patch.paidAt = new Date();
  await db.update(invoice).set(patch).where(eq(invoice.id, id));
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
        paymentUrl: inv.paymentUrl,
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
    paymentUrl: inv.paymentUrl || publicLink,
  };

  const { renderInvoicePdf } = await import("@/lib/invoice/pdf/render");
  const { sendEmail, emailLayout } = await import("@/lib/email");
  const { getIssuer } = await import("@/lib/invoice/get-issuer");
  const pdf = await renderInvoicePdf(invoiceData, "invoice", await getIssuer());

  const payHref = inv.paymentUrl || publicLink;
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
        paymentUrl: q.paymentUrl,
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
    const patch: Record<string, unknown> = { status, updatedAt: new Date() };
    if (status === "paid") patch.paidAt = new Date();
    await db.update(invoice).set(patch).where(inArray(invoice.id, ids));
    revalidatePath("/admin/finance/invoices");
    revalidatePath("/admin/finance/quotes");
    revalidatePath("/admin/finance/receipts");
    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not update status" };
  }
}

