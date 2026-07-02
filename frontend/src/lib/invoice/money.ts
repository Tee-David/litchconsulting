/**
 * Currency + money helpers for invoicing. Money is handled as JS numbers in
 * major units (e.g. naira, not kobo) at the edges, but always persisted as
 * numeric(14,2) strings and recomputed on the server (see actions).
 */

export type CurrencyCode = "NGN" | "USD" | "EUR" | "GBP" | "GHS" | "ZAR" | "KES";

export const CURRENCIES: { code: CurrencyCode; label: string; symbol: string; locale: string }[] = [
  { code: "NGN", label: "Nigerian Naira", symbol: "₦", locale: "en-NG" },
  { code: "USD", label: "US Dollar", symbol: "$", locale: "en-US" },
  { code: "EUR", label: "Euro", symbol: "€", locale: "en-IE" },
  { code: "GBP", label: "British Pound", symbol: "£", locale: "en-GB" },
  { code: "GHS", label: "Ghanaian Cedi", symbol: "₵", locale: "en-GH" },
  { code: "ZAR", label: "South African Rand", symbol: "R", locale: "en-ZA" },
  { code: "KES", label: "Kenyan Shilling", symbol: "KSh", locale: "en-KE" },
];

export const DEFAULT_CURRENCY: CurrencyCode = "NGN";

export function currencyMeta(code: string) {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

/** Format an amount in a currency, e.g. formatMoney(21120, "NGN") → "₦21,120.00". */
export function formatMoney(amount: number, code: string = DEFAULT_CURRENCY): string {
  const meta = currencyMeta(code);
  try {
    return new Intl.NumberFormat(meta.locale, {
      style: "currency",
      currency: meta.code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0);
  } catch {
    return `${meta.symbol}${(amount || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}

/** Coerce a possibly-string numeric value to a finite number. */
export function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

/** Round to 2 dp using a cents-safe rounding to avoid float drift. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type LineInput = {
  quantity: number | string;
  unitPrice: number | string;
  taxRate: number | string; // percent
};

export type LineTotals = { amount: number; tax: number };
export type InvoiceTotals = {
  lines: LineTotals[];
  subtotal: number;
  taxTotal: number;
  total: number;
};

/** Single source of truth for invoice math. Line amount is pre-tax (qty × rate). */
export function computeTotals(items: LineInput[]): InvoiceTotals {
  const lines = items.map((it) => {
    const amount = round2(num(it.quantity) * num(it.unitPrice));
    const tax = round2(amount * (num(it.taxRate) / 100));
    return { amount, tax };
  });
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const taxTotal = round2(lines.reduce((s, l) => s + l.tax, 0));
  const total = round2(subtotal + taxTotal);
  return { lines, subtotal, taxTotal, total };
}
