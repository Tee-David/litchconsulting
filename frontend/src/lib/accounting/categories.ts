/** Expense categories + payment methods shared by the ledger form and reports. */

export const EXPENSE_CATEGORIES = [
  { key: "salaries", label: "Salaries & wages", color: "#4c6ef5" },
  { key: "contractors", label: "Contractors / freelancers", color: "#7c5cff" },
  { key: "rent", label: "Rent & office", color: "#f5a524" },
  { key: "software", label: "Software & subscriptions", color: "#12b3a6" },
  { key: "marketing", label: "Marketing & ads", color: "#e5484d" },
  { key: "travel", label: "Travel & transport", color: "#f97316" },
  { key: "professional", label: "Professional fees", color: "#0ea5e9" },
  { key: "utilities", label: "Utilities & internet", color: "#22c55e" },
  { key: "bank", label: "Bank charges", color: "#8a92a6" },
  { key: "equipment", label: "Equipment & assets", color: "#a855f7" },
  { key: "taxes", label: "Taxes & levies", color: "#b91c1c" },
  { key: "other", label: "Other", color: "#64748b" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["key"];

export const PAYMENT_METHODS = ["transfer", "card", "cash", "cheque"] as const;

export function categoryMeta(key: string) {
  return EXPENSE_CATEGORIES.find((c) => c.key === key) ?? EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
}
