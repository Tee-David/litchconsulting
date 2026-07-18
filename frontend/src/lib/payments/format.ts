/**
 * Human labels for payment methods/channels — shared by the record form, the
 * ledger and the detail modal so a channel always reads the same way ("Bank
 * Transfer", not "bank_transfer"). Client-safe (no server-only).
 */

/** Methods an admin can pick when recording a payment by hand. */
export const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Card" },
  { value: "pos", label: "POS" },
  { value: "other", label: "Other" },
];

const KNOWN: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  bank: "Bank Transfer",
  cash: "Cash",
  cheque: "Cheque",
  card: "Card",
  pos: "POS",
  ussd: "USSD",
  qr: "QR",
  mobile_money: "Mobile Money",
  mark_paid: "Marked Paid",
  other: "Other",
};

/** Proper-case a channel/method for display; title-cases anything unknown. */
export function formatPaymentMethod(value: string | null | undefined): string {
  if (!value) return "—";
  const key = value.toLowerCase();
  if (KNOWN[key]) return KNOWN[key];
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** Human label for a payment status. */
export function formatPaymentStatus(status: string): string {
  switch (status) {
    case "success":
      return "Successful";
    case "failed":
      return "Failed";
    case "abandoned":
      return "Abandoned";
    case "flagged_amount_mismatch":
      return "Amount mismatch — flagged";
    case "duplicate_success":
      return "Duplicate — refund needed";
    case "initialized":
      return "Not completed";
    default:
      return formatPaymentMethod(status);
  }
}
