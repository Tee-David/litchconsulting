import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";
import { invoice, invoiceItem } from "@/lib/db/schema";
import { computeTotals, type LineInput } from "@/lib/invoice/money";
import { nextInvoiceNumber } from "@/lib/db/queries/invoices";

/**
 * Shared invoice creation used by BOTH the admin builder (saveInvoiceAction)
 * and the client request flow (fixed-price checkout creates its invoice
 * atomically with the service request). Totals are always recomputed here —
 * callers never pass amounts.
 *
 * Accepts an optional Drizzle transaction so callers can make invoice +
 * request creation atomic.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type NewInvoiceItem = LineInput & {
  description?: string | null;
  detail?: string | null;
};

export type NewInvoiceInput = {
  kind?: "invoice" | "quote";
  status?: string; // draft | sent
  clientId?: string | null;
  billTo: {
    name?: string | null;
    company?: string | null;
    email?: string | null;
    address?: string | null;
    taxId?: string | null;
  };
  projectTitle?: string | null;
  currency?: string;
  issueDate?: string; // YYYY-MM-DD, defaults today
  dueDate?: string | null;
  notes?: string | null;
  terms?: string | null;
  items: NewInvoiceItem[];
  createdByUserId?: string | null;
  sentAt?: Date | null;
};

export type NewInvoiceResult = {
  id: string;
  number: string;
  publicToken: string;
  total: string;
};

export async function insertInvoiceWithItems(
  input: NewInvoiceInput,
  tx?: Tx
): Promise<NewInvoiceResult> {
  const totals = computeTotals(input.items);
  const kind = input.kind === "quote" ? "quote" : "invoice";
  const number = await nextInvoiceNumber(kind);
  const publicToken = randomUUID();
  const today = new Date().toISOString().slice(0, 10);

  const run = async (t: Tx | typeof db) => {
    const [row] = await t
      .insert(invoice)
      .values({
        number,
        kind,
        status: input.status ?? "draft",
        clientId: input.clientId || null,
        billToName: input.billTo.name || null,
        billToCompany: input.billTo.company || null,
        billToEmail: input.billTo.email || null,
        billToAddress: input.billTo.address || null,
        billToTaxId: input.billTo.taxId || null,
        projectTitle: input.projectTitle || null,
        currency: input.currency || "NGN",
        issueDate: input.issueDate || today,
        dueDate: input.dueDate || null,
        notes: input.notes || null,
        terms: input.terms || null,
        subtotal: String(totals.subtotal),
        taxTotal: String(totals.taxTotal),
        total: String(totals.total),
        publicToken,
        createdByUserId: input.createdByUserId || null,
        sentAt: input.sentAt ?? (input.status === "sent" ? new Date() : null),
      })
      .returning({ id: invoice.id });
    if (input.items.length) {
      await t.insert(invoiceItem).values(
        input.items.map((it, i) => ({
          invoiceId: row.id,
          description: it.description || "Item",
          detail: it.detail || null,
          quantity: String(it.quantity ?? 1),
          unitPrice: String(it.unitPrice ?? 0),
          taxRate: String(it.taxRate ?? 0),
          amount: String(totals.lines[i]?.amount ?? 0),
          position: i,
        }))
      );
    }
    return row.id;
  };

  const id = tx ? await run(tx) : await db.transaction(run);
  return { id, number, publicToken, total: String(totals.total) };
}
