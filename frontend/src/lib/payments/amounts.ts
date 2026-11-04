/**
 * What can be paid on an invoice right now, and how payment reads to people
 * who must never see amounts (staff). Isomorphic and pure — no DB, no
 * server-only — so the pay page, the server actions and the staff dashboard
 * share one definition.
 *
 * Deposit model: an invoice with `deposit_percent` lets the client pay that
 * share first (status → partially_paid), then the balance on the SAME invoice.
 * The amount actually charged is always validated on the server against
 * `payOptions()` — the browser only picks which option.
 */

type InvoiceLike = {
  kind?: string | null;
  status: string;
  total: string | number;
  amountPaid?: string | number | null;
  depositPercent?: number | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export type PayOption = { id: "deposit" | "full" | "balance"; label: string; amount: number; hint: string };

/** Payable statuses for an invoice (quotes are never payable). */
export const PAYABLE_STATUSES = ["sent", "viewed", "overdue", "partially_paid"] as const;

export function isPayable(inv: InvoiceLike): boolean {
  return (inv.kind ?? "invoice") === "invoice" && (PAYABLE_STATUSES as readonly string[]).includes(inv.status) && balanceOf(inv) > 0;
}

export function balanceOf(inv: InvoiceLike): number {
  return r2(Math.max(0, n(inv.total) - n(inv.amountPaid)));
}

/** The deposit amount for an unpaid invoice that allows one, else null. */
export function depositOf(inv: InvoiceLike): number | null {
  const pct = inv.depositPercent ?? 0;
  if (!pct || pct <= 0 || pct >= 100) return null;
  if (n(inv.amountPaid) > 0) return null;
  return r2((n(inv.total) * pct) / 100);
}

/** The options the client may choose between, in display order. */
export function payOptions(inv: InvoiceLike): PayOption[] {
  if (!isPayable(inv)) return [];
  const balance = balanceOf(inv);
  const deposit = depositOf(inv);
  if (deposit !== null) {
    return [
      { id: "deposit", label: `Deposit, ${inv.depositPercent}%`, amount: deposit, hint: "The rest is due on delivery." },
      { id: "full", label: "Full amount", amount: balance, hint: "Nothing more to pay later." },
    ];
  }
  if (n(inv.amountPaid) > 0) {
    return [{ id: "balance", label: "Balance", amount: balance, hint: "What is left after your deposit." }];
  }
  return [{ id: "full", label: "Full amount", amount: balance, hint: "" }];
}

/** Resolve a chosen option id to its amount, or null if it isn't allowed. */
export function amountFor(inv: InvoiceLike, option: string): number | null {
  return payOptions(inv).find((o) => o.id === option)?.amount ?? null;
}

/**
 * Payment as a label without amounts — for staff, who decide whether to start
 * work but never see money.
 */
export function paymentLabel(inv: InvoiceLike | null, opts?: { proofPending?: boolean }): string {
  if (!inv) return "Not billed";
  if (inv.kind === "quote") {
    if (inv.status === "accepted") return "Quote accepted";
    if (inv.status === "declined") return "Quote declined";
    return "Quote sent";
  }
  if (opts?.proofPending) return "Transfer to confirm";
  switch (inv.status) {
    case "paid":
      return "Paid";
    case "partially_paid":
      return inv.depositPercent ? "Deposit paid" : "Part paid";
    case "overdue":
      return "Payment overdue";
    case "void":
      return "Cancelled";
    case "draft":
      return "Not billed";
    default:
      return "Awaiting payment";
  }
}
