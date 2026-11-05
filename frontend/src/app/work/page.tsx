import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Inbox } from "lucide-react";
import { AttentionList, EmptyState, StatusChip } from "@/components/kit";
import { PageHead, Panel, linkBtn } from "@/components/dashboard/ui";
import { requireArea } from "@/lib/server-user";
import { staffAttention } from "@/lib/attention/staff";
import { staffRequestRows } from "@/lib/requests/work";
import { Onboarding } from "@/components/access/onboarding";

export const metadata: Metadata = { title: "My work" };
export const dynamic = "force-dynamic";

function greeting() {
  const h = Number(new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos", hour: "numeric", hour12: false }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short" });

export default async function StaffHome() {
  const user = await requireArea("home", "/work");
  const [items, rows] = await Promise.all([staffAttention(user.id), staffRequestRows(user.id)]);
  const open = rows.filter((r) => r.turn !== "done");
  const week = open.filter((r) => r.nextDue && new Date(r.nextDue).getTime() - Date.now() < 7 * 86_400_000).sort((a, b) => a.nextDue!.localeCompare(b.nextDue!));
  const first = (user.name || "").split(/\s+/)[0] || "there";

  return (
    <div className="space-y-6">
      <PageHead
        title={`${greeting()}, ${first}`}
        lede={`${items.length ? `${items.length} ${items.length === 1 ? "thing needs" : "things need"} you.` : "Nothing needs you right now."} You see the ${open.length} open ${open.length === 1 ? "request" : "requests"} assigned to you.`}
        actions={<Link href="/work/analyses" className={linkBtn.primary}>Open workbench</Link>}
      />

      <div data-tour="attention">
        <AttentionList
          items={items}
          emptyTitle={rows.length ? "You are all caught up" : "No requests assigned to you yet"}
          emptyWhy={rows.length ? "When a client supplies something, asks for changes or writes to you, it shows up here first." : "An admin assigns requests to you. They appear here and in My requests, with everything the client sends."}
        />
      </div>

      {/* R1.5 first-run checklist: below the queue, so real work stays first. Renders nothing once done or hidden. */}
      <Onboarding />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="My requests" sub={String(open.length)} right={<Link href="/work/requests" className={linkBtn.ghost}>All my requests</Link>}>
          {open.length ? (
            <ul className="divide-y divide-hairline">
              {open.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <Link href={`/work/requests/${r.id}`} className="-mx-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-ctl px-2 py-2.5 hover:bg-surface">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{r.client}</span>
                      <span className="block truncate text-xs text-muted">{r.number} · {r.serviceName}</span>
                    </span>
                    <StatusChip domain="request" status={r.status} size="sm" />
                    <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-body" title="Payment">{r.payment}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={<Inbox />} title="Nothing open" why="Requests assigned to you appear here." />
          )}
        </Panel>
        <Panel title="This week">
          {week.length ? (
            <ul className="space-y-3">
              {week.map((r) => (
                <li key={r.id} className="flex gap-3">
                  <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                  <span className="text-sm">
                    <Link href={`/work/requests/${r.id}?tab=asks`} className="font-medium text-ink hover:underline">{r.client}</Link>
                    <span className="block text-muted">Client answers due {fmtDay(r.nextDue!)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-body">No client due dates this week.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
