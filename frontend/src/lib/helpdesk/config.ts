/** Shared Help Desk config: statuses, priorities, categories + their tones. */

export const TICKET_STATUSES = [
  { key: "open", label: "Open", dot: "#4c6ef5", pill: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { key: "pending", label: "Pending", dot: "#f5a524", pill: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { key: "resolved", label: "Resolved", dot: "#16a34a", pill: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  { key: "closed", label: "Closed", dot: "#8a92a6", pill: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
] as const;

export const TICKET_PRIORITIES = [
  { key: "urgent", label: "Urgent", dot: "#e5484d", pill: "bg-red-500/15 text-red-600 dark:text-red-400" },
  { key: "high", label: "High", dot: "#f97316", pill: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  { key: "normal", label: "Normal", dot: "#4c6ef5", pill: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { key: "low", label: "Low", dot: "#8a92a6", pill: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
] as const;

export const TICKET_CATEGORIES = [
  { key: "general", label: "General" },
  { key: "billing", label: "Billing & payments" },
  { key: "onboarding", label: "Onboarding" },
  { key: "reporting", label: "Reporting" },
  { key: "tax", label: "Tax & compliance" },
  { key: "technical", label: "Technical" },
  { key: "complaint", label: "Complaint" },
] as const;

/** Which desk owns the ticket (`ticket.team`). */
export const TICKET_TEAMS = [
  { key: "support", label: "Support", hint: "Portal, access and general help" },
  { key: "finance", label: "Finance", hint: "Invoices, payments and receipts" },
  { key: "advisory", label: "Advisory", hint: "Reporting, tax and modelling work" },
] as const;

/** What kind of request this is (`ticket.type`). */
export const TICKET_TYPES = [
  { key: "question", label: "Question", hint: "Wants information or guidance" },
  { key: "problem", label: "Problem", hint: "Something is broken or wrong" },
  { key: "request", label: "Request", hint: "Asking for work to be done" },
  { key: "billing", label: "Billing", hint: "Invoice, payment or refund matter" },
] as const;

export function statusMeta(key: string) {
  return TICKET_STATUSES.find((s) => s.key === key) ?? TICKET_STATUSES[0];
}
export function priorityMeta(key: string) {
  return TICKET_PRIORITIES.find((p) => p.key === key) ?? TICKET_PRIORITIES[2];
}
export function categoryLabel(key: string) {
  return TICKET_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}
export function teamLabel(key: string | null | undefined) {
  if (!key) return "Unassigned";
  return TICKET_TEAMS.find((t) => t.key === key)?.label ?? key;
}
export function typeLabel(key: string | null | undefined) {
  if (!key) return "Untyped";
  return TICKET_TYPES.find((t) => t.key === key)?.label ?? key;
}

/** `ticket.tags` is jsonb — narrow it to a string[] defensively. */
export function parseTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === "string" && t.trim().length > 0);
}
