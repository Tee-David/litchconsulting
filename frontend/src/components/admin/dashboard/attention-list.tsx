import Link from "next/link";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/components/ui/avatar";
import type { AttentionItem } from "@/lib/db/queries/attention";

/** The operator's worklist — everything currently blocked on you. */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <div className="rounded-card border border-hairline bg-paper">
      <div className="border-b border-hairline px-5 py-4">
        <h3 className="font-display text-sm font-bold text-ink">Needs your action</h3>
      </div>
      {items.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-6">
          <span className="grid size-9 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-5" />
          </span>
          <p className="text-sm text-body">All clear — nothing needs you right now.</p>
        </div>
      ) : (
        <ul className="divide-y divide-hairline">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface"
              >
                <span
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    item.tone === "danger" ? "bg-red-500" : "bg-amber-500"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{item.title}</p>
                  <p className="truncate text-xs text-muted">{item.detail}</p>
                </div>
                <span className="shrink-0 text-xs text-muted">{timeAgo(item.at)}</span>
                <ChevronRight className="size-4 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
