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
} from "lucide-react";
import type { ServiceRequestEvent } from "@/lib/db/schema";
import { Badge } from "@/components/admin/ui/badge";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";

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
  document_uploaded: FileUp,
  documents_complete: FileCheck2,
  deliverable_uploaded: PackageCheck,
  note: MessageSquare,
  ai_analysis_started: Sparkles,
  ai_analysis_completed: Sparkles,
  invoice_linked: FileCheck2,
  cancelled: XCircle,
  declined: XCircle,
  refunded: RotateCcw,
};

const NEGATIVE = new Set(["cancelled", "declined", "refunded"]);

function eventTitle(ev: ServiceRequestEvent): string {
  switch (ev.type) {
    case "created":
      return "Request submitted";
    case "quote_sent":
      return "Quote sent";
    case "payment_received":
      return "Payment received";
    case "status_changed":
      return `Moved to ${(ev.toStatus ?? "").replace(/_/g, " ")}`;
    case "document_uploaded":
      return "Document uploaded";
    case "documents_complete":
      return "All documents received";
    case "deliverable_uploaded":
      return "Deliverable ready";
    case "note":
      return ev.actorRole === "admin" ? "Note from your advisor" : "Note";
    case "ai_analysis_started":
      return "AI analysis started";
    case "ai_analysis_completed":
      return "AI analysis completed";
    case "invoice_linked":
      return "Invoice linked";
    case "cancelled":
      return "Request cancelled";
    case "declined":
      return "Quote declined";
    case "refunded":
      return "Payment refunded";
    default:
      return ev.type.replace(/_/g, " ");
  }
}

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
                    : i === 0
                      ? "border-brand text-brand keep-brand"
                      : "border-emerald-500/70 text-emerald-600 dark:text-emerald-400"
                )}
              >
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-ink">{eventTitle(ev)}</p>
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
