"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  ChevronRight,
  CreditCard,
  FileText,
  Inbox,
  LifeBuoy,
  MessageSquare,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";
import type { NotificationItem } from "@/lib/db/queries/notifications";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "request", label: "Requests" },
  { key: "billing", label: "Billing" },
  { key: "support", label: "Support" },
  { key: "consultation", label: "Consultations" },
] as const;

const GROUP: Record<string, (typeof FILTERS)[number]["key"]> = {
  request: "request",
  invoice_sent: "billing",
  invoice_paid: "billing",
  payment: "billing",
  payment_flagged: "billing",
  ticket_created: "support",
  ticket_replied: "support",
  consultation: "consultation",
};

const ICON: Record<string, typeof Inbox> = {
  request: Inbox,
  invoice_sent: FileText,
  invoice_paid: CreditCard,
  payment: CreditCard,
  payment_flagged: AlertTriangle,
  ticket_created: LifeBuoy,
  ticket_replied: MessageSquare,
  consultation: CalendarClock,
};

/** Full client activity timeline with type-filter chips (items pre-capped server-side). */
export function ActivityList({ items }: { items: NotificationItem[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");

  const shown = useMemo(
    () => (filter === "all" ? items : items.filter((i) => GROUP[i.type] === filter)),
    [items, filter]
  );

  return (
    <div className="rounded-card border border-hairline bg-paper">
      <div className="flex flex-wrap gap-1.5 border-b border-hairline px-5 py-3.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
              filter === f.key ? "bg-brand text-white keep-brand" : "text-muted hover:bg-surface hover:text-ink"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">Nothing here yet.</p>
      ) : (
        <ol className="divide-y divide-hairline">
          {shown.map((item) => {
            const Icon = ICON[item.type] ?? Inbox;
            const flagged = item.type === "payment_flagged";
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface"
                >
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-full",
                      flagged ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-brand-tint text-brand"
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{item.title}</p>
                    <p className="truncate text-xs text-muted">{item.description}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted">{formatDateTime(item.at)}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted" />
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
