import { CalendarClock, Video } from "lucide-react";
import { Badge } from "@/components/admin/ui/badge";
import { formatDateTime } from "@/lib/format-date";
import type { Consultation } from "@/lib/db/schema";

/** The week ahead: booked consultations with one-tap join links. */
export function ConsultationsCard({ rows }: { rows: Consultation[] }) {
  return (
    <div data-tour="consultations" className="rounded-card border border-hairline bg-paper">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <h3 className="font-display text-sm font-bold text-ink">Next 7 days</h3>
        <CalendarClock className="size-4 text-muted" />
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-body">No consultations booked.</p>
      ) : (
        <div className="divide-y divide-hairline">
          {rows.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {c.startsAt ? formatDateTime(c.startsAt) : "Unscheduled"}
                </p>
                <p className="truncate text-xs text-muted">{c.name || c.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {c.status === "rescheduled" && <Badge tone="warning">moved</Badge>}
                {c.meetingUrl && (
                  <a
                    href={c.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-hairline px-3 py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-surface"
                  >
                    <Video className="size-3.5" /> Join
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
