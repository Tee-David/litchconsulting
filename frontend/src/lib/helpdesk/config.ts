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

export function statusMeta(key: string) {
  return TICKET_STATUSES.find((s) => s.key === key) ?? TICKET_STATUSES[0];
}
export function priorityMeta(key: string) {
  return TICKET_PRIORITIES.find((p) => p.key === key) ?? TICKET_PRIORITIES[2];
}
export function categoryLabel(key: string) {
  return TICKET_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}
