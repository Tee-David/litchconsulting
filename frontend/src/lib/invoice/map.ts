import type { Invoice, InvoiceItem } from "@/lib/db/schema";
import type { InvoiceData, InvoiceInput } from "./types";
import { num } from "./money";

const billToOf = (inv: Invoice) => ({
  name: inv.billToName || undefined,
  company: inv.billToCompany || undefined,
  email: inv.billToEmail || undefined,
  address: inv.billToAddress || undefined,
  taxId: inv.billToTaxId || undefined,
});

const itemsOf = (items: InvoiceItem[]) =>
  items.map((it) => ({
    description: it.description,
    detail: it.detail || undefined,
    quantity: num(it.quantity),
    unitPrice: num(it.unitPrice),
    taxRate: num(it.taxRate),
  }));

const SITE_BASE = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.litchconsulting.com"
).replace(/\/$/, "");

/**
 * DB row + items → on-screen / PDF invoice shape. The pay-button target is
 * always our public invoice page (Paystack + bank transfer live there) —
 * manual payment links are retired.
 */
export function toInvoiceData(inv: Invoice, items: InvoiceItem[]): InvoiceData {
  return {
    number: inv.number,
    status: inv.status,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    currency: inv.currency,
    projectTitle: inv.projectTitle,
    billTo: billToOf(inv),
    items: itemsOf(items),
    notes: inv.notes,
    terms: inv.terms,
    paymentUrl: inv.publicToken ? `${SITE_BASE}/i/${inv.publicToken}` : null,
    publicToken: inv.publicToken,
  };
}

/** DB row + items → editable builder input. */
export function toInvoiceInput(inv: Invoice, items: InvoiceItem[]): InvoiceInput {
  return {
    id: inv.id,
    number: inv.number,
    status: inv.status,
    clientId: inv.clientId,
    billTo: billToOf(inv),
    projectTitle: inv.projectTitle || undefined,
    currency: inv.currency,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate || undefined,
    notes: inv.notes || undefined,
    terms: inv.terms || undefined,
    items: itemsOf(items),
  };
}
