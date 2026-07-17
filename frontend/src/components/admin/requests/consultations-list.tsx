"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Search } from "lucide-react";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { Badge } from "@/components/admin/ui/badge";
import { formatDateTime } from "@/lib/format-date";
import type { Consultation } from "@/lib/db/schema";

/**
 * Cal.com bookings, searchable by name or email. Kept as a plain list rather
 * than a DataTable: it's a short, chronological feed with one action, and the
 * join link is the point — a paginated grid would bury it.
 */
export function ConsultationsList({ rows }: { rows: Consultation[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const filtered = useMemo(
    () => (!q ? rows : rows.filter((c) => `${c.name ?? ""} ${c.email ?? ""}`.toLowerCase().includes(q))),
    [rows, q]
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-hairline bg-paper p-10">
        <EmptyState
          icon={CalendarClock}
          title="No consultations yet"
          description="Bookings made through the Cal.com scheduler on /book appear here automatically."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          aria-label="Search consultations"
          className="h-9 w-full rounded-lg border border-hairline bg-paper pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-brand"
        />
      </div>

      <div className="rounded-card border border-hairline bg-paper">
        {filtered.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-body">No consultations match “{query}”.</p>
        ) : (
          <div className="divide-y divide-hairline">
            {filtered.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{c.name || c.email}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {c.email}
                    {c.startsAt ? ` · ${formatDateTime(c.startsAt)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {c.meetingUrl && c.status !== "cancelled" && (
                    <a
                      href={c.meetingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-brand hover:underline"
                    >
                      Join call
                    </a>
                  )}
                  <Badge
                    tone={c.status === "cancelled" ? "danger" : c.status === "rescheduled" ? "warning" : "success"}
                  >
                    {c.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
