import { computeTotals, formatMoney } from "./money";
import type { InvoiceData } from "./types";

/**
 * Content rules shared by all three document renderers (invoice-preview.tsx,
 * pdf/invoice-html.ts, pdf/InvoiceDocument.tsx) so deposits, part payments,
 * stamps and the quote's accept box can never diverge between the screen,
 * the Chromium PDF and the @react-pdf fallback. Renderers only style these.
 */

export type DocVariant = "invoice" | "receipt" | "quote";
export type SettleRow = { label: string; value: string; strong?: boolean };

/** Fixed paper hex (documents keep their colours in dark mode, like paper). */
export const STAMPS: Record<string, { label: string; color: string }> = {
  paid: { label: "PAID", color: "#16a34a" },
  sent: { label: "SENT", color: "#d97706" },
  overdue: { label: "OVERDUE", color: "#dc2626" },
  draft: { label: "DRAFT", color: "#8a92a6" },
  void: { label: "VOID", color: "#8a92a6" },
  accepted: { label: "ACCEPTED", color: "#16a34a" },
  declined: { label: "DECLINED", color: "#dc2626" },
  partially_paid: { label: "PART PAID", color: "#c98500" },
};

const depositDue = (total: number, pct: number) => Math.round(total * pct) / 100;

/** The diagonal stamp, or none when the green paid banner shows instead. */
export function stampFor(data: InvoiceData, showBanner: boolean): { label: string; color: string } | undefined {
  if (showBanner) return undefined;
  if (data.status === "partially_paid" && data.deposit) {
    const total = computeTotals(data.items).total;
    if ((data.amountPaid ?? 0) + 0.5 >= depositDue(total, data.deposit.percent)) return { label: "DEPOSIT PAID", color: "#16a34a" };
  }
  return STAMPS[data.status];
}

/** Title in the document header. */
export function docTitle(variant: DocVariant, data: InvoiceData): string {
  if (variant === "quote") return "QUOTE";
  if (variant === "receipt") return "RECEIPT";
  return data.deposit ? "DEPOSIT INVOICE" : "INVOICE";
}

/** Meta row labels and values (number, dates, project). */
export function metaFor(variant: DocVariant, data: InvoiceData): Array<{ label: string; value: string }> {
  return [
    { label: variant === "quote" ? "Quote No." : variant === "receipt" ? "Receipt for" : "Invoice No.", value: data.number },
    { label: "Issued", value: data.issueDate },
    ...(variant === "receipt" && data.paidAt ? [{ label: "Paid", value: data.paidAt }] : []),
    ...(data.dueDate && variant !== "receipt" ? [{ label: variant === "quote" ? "Valid to" : "Due", value: data.dueDate }] : []),
    ...(data.projectTitle ? [{ label: "Project", value: data.projectTitle }] : []),
  ];
}

/** Rows under the grand total: deposit due, paid so far, balance. */
export function settlementRows(variant: DocVariant, data: InvoiceData): SettleRow[] {
  const total = computeTotals(data.items).total;
  const fmt = (n: number) => formatMoney(n, data.currency);
  const paid = data.amountPaid ?? 0;
  if (variant === "quote") {
    return data.deposit ? [{ label: `Deposit to start (${data.deposit.percent}%)`, value: fmt(depositDue(total, data.deposit.percent)) }] : [];
  }
  if (variant === "receipt") return [];
  if (data.deposit) {
    const due = depositDue(total, data.deposit.percent);
    return [
      { label: `Deposit due now (${data.deposit.percent}%)`, value: fmt(due) },
      ...(paid > 0 ? [{ label: "Paid", value: `−${fmt(paid)}` }] : []),
      { label: "Deposit balance", value: fmt(Math.max(0, due - paid)), strong: true },
      { label: "Balance, due on delivery", value: fmt(Math.max(0, total - Math.max(paid, due))) },
    ];
  }
  if (paid > 0 && data.status !== "paid") {
    return [
      { label: "Paid", value: `−${fmt(paid)}` },
      { label: "Balance due", value: fmt(Math.max(0, total - paid)), strong: true },
    ];
  }
  return [];
}

/** The quote's accept box text, when there is a public link. */
export function acceptLine(variant: DocVariant, data: InvoiceData): string | null {
  if (variant !== "quote" || !data.paymentUrl) return null;
  return `Accept online in one click: ${data.paymentUrl.replace(/^https?:\/\//, "")}. Your invoice and pay link follow straight away.`;
}
