import type { BadgeTone } from "@/components/admin/ui/badge";

/**
 * Service-request lifecycle. One fixed status machine underneath everything;
 * per-service display copy is layered on via `stepLabels` snapshots (see
 * displaySteps below). The invoice owns the money; the request owns the work.
 *
 *  fixed:  submit → pending_payment ─┐
 *  quote:  submit → quote_requested ─(admin sends invoice)→ pending_payment
 *  pending_payment ─(paid)→ awaiting_documents (→ in_progress if no docs required)
 *  awaiting_documents ─(all required slots filled)→ in_progress → [in_review]
 *      → delivered → completed
 *  terminals: cancelled (pre-pay) · declined (quote path) · refunded (post-pay)
 */
export const REQUEST_STATUSES = [
  "quote_requested",
  "pending_payment",
  "awaiting_documents",
  "in_progress",
  "in_review",
  "delivered",
  "completed",
  "cancelled",
  "declined",
  "refunded",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Server-enforced transition map — every status action must consult this. */
export const LEGAL_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  quote_requested: ["pending_payment", "declined", "cancelled"],
  // quote_requested revert covers "invoice voided while awaiting payment"
  pending_payment: ["awaiting_documents", "in_progress", "cancelled", "quote_requested"],
  awaiting_documents: ["in_progress", "refunded"],
  in_progress: ["in_review", "delivered", "refunded"],
  in_review: ["in_progress", "delivered", "refunded"],
  delivered: ["completed", "in_progress", "refunded"], // in_progress = revision
  completed: [],
  cancelled: [],
  declined: [],
  refunded: [],
};

export const TERMINAL_STATUSES: RequestStatus[] = ["completed", "cancelled", "declined", "refunded"];
export const ACTIVE_STATUSES: RequestStatus[] = REQUEST_STATUSES.filter(
  (s) => !TERMINAL_STATUSES.includes(s)
);

export function canTransition(from: string, to: string): boolean {
  return (LEGAL_TRANSITIONS[from as RequestStatus] ?? []).includes(to as RequestStatus);
}

/** Human label for any status (fallback when no per-service override). */
export const STATUS_LABELS: Record<RequestStatus, string> = {
  quote_requested: "Quote requested",
  pending_payment: "Pending payment",
  awaiting_documents: "Awaiting documents",
  in_progress: "In progress",
  in_review: "In review",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  declined: "Declined",
  refunded: "Refunded",
};

/** Badge tone per status (matches invoiceStatusTone conventions). */
export function requestStatusTone(status: string): BadgeTone {
  switch (status as RequestStatus) {
    case "completed":
    case "delivered":
      return "success";
    case "in_progress":
    case "in_review":
      return "info";
    case "pending_payment":
    case "awaiting_documents":
    case "quote_requested":
      return "warning";
    case "cancelled":
    case "declined":
    case "refunded":
      return "danger";
    default:
      return "neutral";
  }
}

/** Per-service display overrides, keyed by status. Stored/snapshotted as jsonb. */
export type StepLabelOverrides = Partial<
  Record<RequestStatus, { label?: string; description?: string; turnaround?: string }>
>;

export type DisplayStep = {
  key: string;
  label: string;
  description?: string;
  turnaround?: string;
  /** done | current | upcoming */
  state: "done" | "current" | "upcoming";
  at?: Date | null;
};

/**
 * The horizontal milestone track shown on request detail pages. Milestones map
 * onto ranges of the underlying machine; terminal-negative statuses render the
 * vertical timeline instead (the tracker hides itself).
 */
const MILESTONES: Array<{ key: string; label: string; statuses: RequestStatus[] }> = [
  { key: "requested", label: "Requested", statuses: ["quote_requested"] },
  { key: "payment", label: "Payment", statuses: ["pending_payment"] },
  { key: "documents", label: "Documents", statuses: ["awaiting_documents"] },
  { key: "in_progress", label: "In progress", statuses: ["in_progress", "in_review"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered", "completed"] },
];

/**
 * Build the milestone steps for a request, applying per-service label
 * overrides. `status` is the request's current status; timestamps come from
 * the event feed and are attached by the caller where available.
 */
export function displaySteps(status: string, overrides?: StepLabelOverrides | null): DisplayStep[] {
  const idx = MILESTONES.findIndex((m) => m.statuses.includes(status as RequestStatus));
  const isTerminalNegative = ["cancelled", "declined", "refunded"].includes(status);
  const completedAll = status === "completed";
  return MILESTONES.map((m, i) => {
    const primary = m.statuses[0];
    const o = overrides?.[primary] ?? overrides?.[m.statuses[1] as RequestStatus];
    let state: DisplayStep["state"];
    if (isTerminalNegative) state = "upcoming";
    else if (completedAll || i < idx) state = "done";
    else if (i === idx) state = status === "delivered" || completedAll ? "done" : "current";
    else state = "upcoming";
    return {
      key: m.key,
      label: o?.label ?? m.label,
      description: o?.description,
      turnaround: o?.turnaround,
      state,
    };
  });
}
