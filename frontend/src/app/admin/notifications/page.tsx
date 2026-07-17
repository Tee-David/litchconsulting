import Link from "next/link";
import { UserPlus, Send, CheckCircle2, Bell } from "lucide-react";
import { recentNotifications } from "@/lib/db/queries/notifications";
import { PageHeader } from "@/components/admin/ui/page-header";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { formatDateTime } from "@/lib/format-date";

export const dynamic = "force-dynamic";

const ICON = { lead: UserPlus, invoice_sent: Send, invoice_paid: CheckCircle2 } as const;

export default async function NotificationsPage() {
  const items = await recentNotifications(50);

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" description="Recent activity across your practice." />
      {items.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications yet" description="New leads and invoice activity will appear here." />
      ) : (
        <div className="divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-paper">
          {items.map((n) => {
            const Icon = (n.type in ICON) ? ICON[n.type as keyof typeof ICON] : Bell;
            return (
              <Link key={n.id} href={n.href} className="flex items-start gap-3 px-5 py-4 transition-colors hover:bg-surface">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-brand-tint text-brand">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{n.title}</p>
                  <p className="truncate text-sm text-body">{n.description}</p>
                </div>
                <span className="shrink-0 text-xs text-muted">{formatDateTime(n.at)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
