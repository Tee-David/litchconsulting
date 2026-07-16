import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/admin/ui/badge";
import {
  displaySteps,
  requestStatusTone,
  STATUS_LABELS,
  type RequestStatus,
  type StepLabelOverrides,
} from "@/lib/requests/status";
import { formatDate } from "@/lib/format-date";
import { formatMoney, num } from "@/lib/invoice/money";
import type { ServiceRequest } from "@/lib/db/schema";

/** The single most useful thing the client can do next, per status. */
export function nextAction(status: string): string | null {
  switch (status as RequestStatus) {
    case "quote_requested":
      return "Quote on its way";
    case "pending_payment":
      return "Complete payment";
    case "awaiting_documents":
      return "Upload documents";
    case "in_progress":
    case "in_review":
      return "We're working on it";
    case "delivered":
      return "Review & download";
    default:
      return null;
  }
}

/**
 * Progress card for an in-flight request (used on the dashboard home and the
 * My Services list): compact milestone bar + the next action, one tap deep.
 */
export function ActiveRequestCard({ req }: { req: ServiceRequest }) {
  const steps = displaySteps(req.status, req.stepLabels as StepLabelOverrides);
  const done = steps.filter((s) => s.state === "done").length;
  const action = nextAction(req.status);
  return (
    <Link
      href={`/dashboard/requests/${req.id}`}
      className="group flex flex-col rounded-card border border-hairline bg-paper p-5 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lg hover:shadow-brand/5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-base font-bold text-ink">{req.serviceName}</p>
          <p className="mt-0.5 text-xs text-muted">
            {req.number} · Submitted {formatDate(req.createdAt)}
          </p>
        </div>
        <Badge tone={requestStatusTone(req.status)}>
          {STATUS_LABELS[req.status as RequestStatus] ?? req.status}
        </Badge>
      </div>

      <div className="mt-4 flex items-center gap-1.5">
        {steps.map((s) => (
          <span
            key={s.key}
            className={
              "h-1.5 flex-1 rounded-full " +
              (s.state === "done"
                ? "bg-emerald-500"
                : s.state === "current"
                  ? "bg-brand animate-pulse"
                  : "bg-hairline")
            }
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {done}/{steps.length} milestones · {steps.find((s) => s.state === "current")?.label ?? "Done"}
      </p>

      <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3.5">
        <span className="text-sm font-semibold tabular-nums text-ink">
          {req.priceSnapshot ? formatMoney(num(req.priceSnapshot), req.currency) : "Custom quote"}
        </span>
        {action && (
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand group-hover:underline">
            {action} <ChevronRight className="size-4" />
          </span>
        )}
      </div>
    </Link>
  );
}
