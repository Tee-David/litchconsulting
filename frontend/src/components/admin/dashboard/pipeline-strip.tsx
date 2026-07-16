import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { STATUS_LABELS, type RequestStatus } from "@/lib/requests/status";

const PIPELINE: RequestStatus[] = [
  "quote_requested",
  "pending_payment",
  "awaiting_documents",
  "in_progress",
  "in_review",
  "delivered",
];

/** Active-request pipeline: one clickable chip per stage → filtered requests list. */
export function PipelineStrip({ counts }: { counts: Record<string, number> }) {
  return (
    <div className="rounded-card border border-hairline bg-paper p-5">
      <h3 className="mb-3 font-display text-sm font-bold text-ink">Requests pipeline</h3>
      <div className="flex flex-wrap items-center gap-1.5">
        {PIPELINE.map((status, i) => (
          <span key={status} className="flex items-center gap-1.5">
            <Link
              href={`/admin/requests?filter=${status}`}
              className="group flex items-center gap-2 rounded-full border border-hairline px-3.5 py-2 text-xs font-semibold text-body transition-colors hover:border-brand/40 hover:bg-surface"
            >
              {STATUS_LABELS[status]}
              <span
                className={
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none " +
                  ((counts[status] ?? 0) > 0 ? "bg-brand-tint text-brand" : "bg-surface text-muted")
                }
              >
                {counts[status] ?? 0}
              </span>
            </Link>
            {i < PIPELINE.length - 1 && <ArrowRight className="size-3 text-muted" />}
          </span>
        ))}
      </div>
    </div>
  );
}
