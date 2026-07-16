import Link from "next/link";
import { STATUS_LABELS, requestStatusTone, type RequestStatus } from "@/lib/requests/status";
import { cn } from "@/lib/utils";

const PIPELINE: RequestStatus[] = [
  "quote_requested",
  "pending_payment",
  "awaiting_documents",
  "in_progress",
  "in_review",
  "delivered",
];

const DOT: Record<string, string> = {
  success: "bg-emerald-500",
  info: "bg-brand",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  neutral: "bg-muted",
};

/** Active-request pipeline as individual small stat cards → filtered requests list. */
export function PipelineStrip({ counts }: { counts: Record<string, number> }) {
  return (
    <div>
      <h3 className="mb-3 font-display text-sm font-bold text-ink">Requests pipeline</h3>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {PIPELINE.map((status) => {
          const n = counts[status] ?? 0;
          return (
            <Link
              key={status}
              href={`/admin/requests?filter=${status}`}
              className="group rounded-card border border-hairline bg-paper p-3.5 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lg hover:shadow-brand/5"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={cn("size-2 rounded-full", DOT[requestStatusTone(status)] ?? "bg-muted")}
                />
                <span className="truncate text-[11px] font-medium text-muted">
                  {STATUS_LABELS[status]}
                </span>
              </div>
              <p
                className={cn(
                  "mt-1.5 font-display text-2xl font-bold tabular-nums",
                  n > 0 ? "text-ink" : "text-muted"
                )}
              >
                {n}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
