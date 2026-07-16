import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  displaySteps,
  STATUS_LABELS,
  type RequestStatus,
  type StepLabelOverrides,
} from "@/lib/requests/status";
import { formatDateTime } from "@/lib/format-date";

/**
 * Horizontal milestone tracker for a service request (order-tracking inspo):
 * filled check nodes for completed milestones, a pulsing current node, and
 * per-service sub-labels/turnarounds from the offering's stepLabels snapshot.
 * Terminal-negative requests (cancelled/declined/refunded) show a banner
 * instead of the track. Used on BOTH the client and admin detail pages.
 */
export function RequestProgressTracker({
  status,
  stepLabels,
  timestamps,
  className,
}: {
  status: string;
  stepLabels?: StepLabelOverrides | null;
  /** milestone key → time it completed (derived from events by the caller) */
  timestamps?: Partial<Record<string, Date | string>>;
  className?: string;
}) {
  const negative = ["cancelled", "declined", "refunded"].includes(status);
  if (negative) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-card border border-red-500/25 bg-red-500/[0.05] p-4",
          className
        )}
      >
        <XCircle className="size-6 shrink-0 text-red-500" />
        <div>
          <p className="text-sm font-semibold text-ink">
            {STATUS_LABELS[status as RequestStatus] ?? status}
          </p>
          <p className="text-xs text-body">See the timeline below for the full history.</p>
        </div>
      </div>
    );
  }

  const steps = displaySteps(status, stepLabels);
  return (
    <div className={cn("rounded-card border border-hairline bg-paper p-5", className)}>
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-hairline sm:left-8 sm:right-8 sm:top-4 sm:bottom-auto sm:h-0.5 sm:w-auto" />
        {steps.map((step) => {
          const at = timestamps?.[step.key];
          return (
            <div
              key={step.key}
              className="relative flex items-start gap-3 sm:flex-1 sm:flex-col sm:items-center sm:gap-2 sm:text-center"
            >
              <div
                className={cn(
                  "z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 bg-paper transition-all",
                  step.state === "done" &&
                    "border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400",
                  step.state === "current" && "border-brand text-brand keep-brand ring-4 ring-brand/10",
                  step.state === "upcoming" && "border-hairline text-muted"
                )}
              >
                {step.state === "done" ? (
                  <CheckCircle2 className="size-4.5" />
                ) : (
                  <span
                    className={cn(
                      "size-2.5 rounded-full",
                      step.state === "current" ? "bg-brand animate-pulse" : "bg-hairline"
                    )}
                  />
                )}
              </div>
              <div className="min-w-0 sm:space-y-0.5">
                <p
                  className={cn(
                    "text-sm font-semibold",
                    step.state === "upcoming" ? "text-muted" : "text-ink"
                  )}
                >
                  {step.label}
                </p>
                {step.state === "done" && at && (
                  <p className="text-xs text-muted">{formatDateTime(at)}</p>
                )}
                {step.state === "current" && (step.description || step.turnaround) && (
                  <p className="text-xs text-body">
                    {step.description}
                    {step.description && step.turnaround ? " · " : ""}
                    {step.turnaround && (
                      <span className="font-medium">{step.turnaround}</span>
                    )}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
