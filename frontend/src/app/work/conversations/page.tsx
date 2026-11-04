import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, MessagesSquare } from "lucide-react";
import { EmptyState, StatusChip } from "@/components/kit";
import { PageHead, Panel, linkBtn } from "@/components/dashboard/ui";
import { MessageThread } from "@/components/dashboard/message-thread";
import { requireArea } from "@/lib/server-user";
import { staffThreads } from "@/lib/requests/work";
import { cn } from "@/lib/utils";
import { replyAction } from "../actions";

export const metadata: Metadata = { title: "Conversations" };
export const dynamic = "force-dynamic";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short" }) : "");

/** Client threads on assigned requests only. Team notes stay inside the firm. */
export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const user = await requireArea("helpDesk", "/work/conversations");
  const { r } = await searchParams;
  const threads = await staffThreads(user.id);
  const selected = threads.find((t) => t.id === r) ?? null;

  return (
    <div>
      <PageHead title="Conversations" lede="Client threads on your requests. Tick Team note to write something only the firm sees." />
      {threads.length === 0 ? (
        <Panel>
          <EmptyState icon={<MessagesSquare />} title="No conversations yet" why="When a client writes on a request assigned to you, it appears here." />
        </Panel>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <nav aria-label="Threads" className={cn("rounded-card border border-hairline bg-paper", selected && "hidden lg:block")}>
            <ul className="divide-y divide-hairline">
              {threads.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/work/conversations?r=${t.id}`}
                    aria-current={t.id === selected?.id ? "true" : undefined}
                    className={cn("flex gap-3 px-4 py-3 hover:bg-surface", t.id === selected?.id && "bg-brand-tint")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={cn("truncate text-sm text-ink", t.unanswered ? "font-semibold" : "font-medium")}>{t.client}</span>
                        {t.unanswered ? <span className="rounded-full bg-act px-1.5 text-[11px] font-semibold text-act-ink">{t.unanswered}</span> : null}
                      </span>
                      <span className="block truncate text-xs text-muted">{t.number} · {t.messages[t.messages.length - 1]?.body ?? "No messages yet"}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">{when(t.lastAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {selected ? (
            <Panel
              title={
                <span className="flex items-center gap-2">
                  <Link href="/work/conversations" className="grid size-8 place-items-center rounded-ctl text-muted hover:bg-surface lg:hidden" aria-label="Back to threads">
                    <ChevronLeft className="size-4" />
                  </Link>
                  {selected.client}
                </span>
              }
              sub={`${selected.number} · ${selected.serviceName}`}
              right={
                <span className="flex items-center gap-2">
                  <StatusChip domain="request" status={selected.status} size="sm" />
                  <Link href={`/work/requests/${selected.id}`} className={linkBtn.ghost}>Open request</Link>
                </span>
              }
            >
              <MessageThread
                messages={selected.messages}
                viewer="firm"
                allowInternal
                closed={["completed", "cancelled", "declined", "refunded"].includes(selected.status)}
                send={replyAction.bind(null, selected.id)}
                placeholder={`Write to ${selected.client}`}
              />
            </Panel>
          ) : (
            <Panel className="hidden lg:block">
              <EmptyState compact title="Pick a thread" why="Threads with unanswered client messages are marked with a count." />
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
