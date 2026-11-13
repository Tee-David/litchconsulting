/**
 * ONE definition of "late" money, used by admin home, Billing and the client list.
 *
 * An invoice is late when all of these are true:
 * - it is an invoice (not a quote);
 * - it is still open: sent, viewed, overdue or partially_paid. A part-paid
 *   invoice past its due date IS late: money is still owed after the date;
 * - its stored status is "overdue", or its due date is before today (Lagos).
 *
 * The late amount is the outstanding balance (total minus amount paid), never
 * the invoice total, so a part payment always reduces the late figure.
 *
 * Client-safe: no server imports.
 */

export const OPEN_INVOICE_STATUSES = ["sent", "viewed", "overdue", "partially_paid"] as const;

/** Today's date in Lagos as yyyy-mm-dd (due dates are calendar days in Lagos). */
export function lagosToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function isOpenInvoice(inv: { kind?: string | null; status: string }): boolean {
  return (inv.kind ?? "invoice") === "invoice" && (OPEN_INVOICE_STATUSES as readonly string[]).includes(inv.status);
}

export function isLateInvoice(
  inv: { kind?: string | null; status: string; dueDate: string | null },
  today: string = lagosToday(),
): boolean {
  if (!isOpenInvoice(inv)) return false;
  return inv.status === "overdue" || Boolean(inv.dueDate && inv.dueDate < today);
}

/** What is still owed on an invoice, never below zero. */
export function outstanding(total: number, paid: number): number {
  return Math.max(0, total - paid);
}

/** "1 invoice", "3 invoices". */
export function countInvoices(n: number): string {
  return `${n} invoice${n === 1 ? "" : "s"}`;
}
