import type { Invoice } from "@/lib/db/schema";
import { num, round2 } from "@/lib/invoice/money";

/**
 * Accounts-receivable aging over unpaid invoices (kind=invoice,
 * status sent|overdue). Amount owed = total − amountPaid; bucketed by days
 * past the due date (no due date → current). Pure — feed it already-fetched
 * invoice rows.
 */
export type AgingBuckets = {
  buckets: { label: string; amount: number }[];
  totalOutstanding: number;
  oldestDue: string | null; // YYYY-MM-DD
};

const BUCKETS = [
  { label: "Current", min: -Infinity, max: 0 },
  { label: "1–30 days", min: 1, max: 30 },
  { label: "31–60 days", min: 31, max: 60 },
  { label: "61–90 days", min: 61, max: 90 },
  { label: "90+ days", min: 91, max: Infinity },
];

export function agingBuckets(invoices: Invoice[], now = new Date()): AgingBuckets {
  const open = invoices.filter(
    (i) => i.kind === "invoice" && ["sent", "overdue"].includes(i.status)
  );
  const amounts = BUCKETS.map(() => 0);
  let oldestDue: string | null = null;

  for (const inv of open) {
    const owed = round2(num(inv.total) - num(inv.amountPaid));
    if (owed <= 0) continue;
    let days = 0;
    if (inv.dueDate) {
      days = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86_400_000);
      if (days > 0 && (!oldestDue || inv.dueDate < oldestDue)) oldestDue = inv.dueDate;
    }
    const idx = BUCKETS.findIndex((b) => days >= b.min && days <= b.max);
    amounts[idx >= 0 ? idx : 0] += owed;
  }

  return {
    buckets: BUCKETS.map((b, i) => ({ label: b.label, amount: round2(amounts[i]) })),
    totalOutstanding: round2(amounts.reduce((s, a) => s + a, 0)),
    oldestDue,
  };
}
