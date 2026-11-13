import {
  CheckCircle2,
  CreditCard,
  FileUp,
  FileCheck2,
  PackageCheck,
  MessageSquare,
  Sparkles,
  XCircle,
  RotateCcw,
  CircleDot,
  Loader,
  AlertTriangle,
} from "lucide-react";
import type { ServiceRequestEvent } from "@/lib/db/schema";
import { Badge } from "@/components/admin/ui/badge";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";
import { requestEventTitle } from "@/lib/requests/event-title";

/**
 * Vertical tracking history (order-tracking inspo): check node + dashed
 * connector per event, newest first. Internal events (admin view only) are
 * marked with an "Internal" badge — the client query never returns them.
 */

const EVENT_ICONS: Record<string, typeof CheckCircle2> = {
  created: CircleDot,
  quote_sent: FileCheck2,
  payment_received: CreditCard,
  status_changed: CheckCircle2,
  status: CheckCircle2,
  ai_working_copy_saved: Sparkles,
  document_uploaded: FileUp,
  documents_complete: FileCheck2,
  deliverable_uploaded: PackageCheck,
  note: MessageSquare,
  message: MessageSquare,
  processing_update: Loader,
  correction_requested: AlertTriangle,
  ai_analysis_started: Sparkles,
  ai_analysis_completed: Sparkles,
  invoice_linked: FileCheck2,
  cancelled: XCircle,
  declined: XCircle,
  refunded: RotateCcw,
};

const NEGATIVE = new Set(["cancelled", "declined", "refunded"]);
// Needs client action — amber, not the red of a terminal failure.
const ATTENTION = new Set(["correction_requested"]);

export function RequestTimeline({
  events,
  className,
}: {
  events: ServiceRequestEvent[];
  className?: string;
}) {
  if (events.length === 0) return null;
  return (
    <div className={cn("rounded-card border border-hairline bg-paper p-5", className)}>
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">
        Tracking history
      </h3>
      <ol className="relative space-y-5">
        {events.map((ev, i) => {
          const Icon = EVENT_ICONS[ev.type] ?? CheckCircle2;
          const negative = NEGATIVE.has(ev.type);
          const attention = ATTENTION.has(ev.type);
          return (
            <li key={ev.id} className="relative flex gap-3.5">
              {i < events.length - 1 && (
                <span
                  aria-hidden
                  className="absolute left-4 top-9 h-[calc(100%-16px)] w-px border-l border-dashed border-hairline"
                />
              )}
              <div
                className={cn(
                  "z-10 grid size-8 shrink-0 place-items-center rounded-full border-2 bg-paper",
                  negative
                    ? "border-red-400 text-red-500"
                    : attention
                      ? "border-amber-400 text-amber-500"
                      : i === 0
                        ? "border-brand text-brand keep-brand"
                        : "border-emerald-500/70 text-emerald-600 dark:text-emerald-400"
                )}
              >
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-ink">{requestEventTitle(ev)}</p>
                  {ev.visibility === "internal" && <Badge tone="warning">Internal</Badge>}
                </div>
                <p className="text-xs text-muted">{formatDateTime(ev.createdAt)}</p>
                {ev.message && <p className="mt-1 text-sm text-body">{ev.message}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
