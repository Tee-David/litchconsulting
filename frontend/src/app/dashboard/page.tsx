import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, RotateCcw } from "lucide-react";
import { AttentionList, StatusChip, EmptyState } from "@/components/kit";
import { PageHead, Panel, KV, Stepper, Initials, linkBtn } from "@/components/dashboard/ui";
import { FileLink } from "@/components/dashboard/file-link";
import { requestSteps, nowNext } from "@/components/dashboard/request-steps";
import { getPortal, clientRequestRows, clientFiles, clientBilling } from "@/lib/requests/portal";
import { clientAttention } from "@/lib/attention/client";
import { formatMoney } from "@/lib/invoice/money";
import { balanceOf } from "@/lib/payments/amounts";
import { formatDate } from "@/lib/format-date";
import { Onboarding } from "@/components/access/onboarding";

export const metadata: Metadata = { title: "Home" };
export const dynamic = "force-dynamic";

function greeting() {
  const h = Number(new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos", hour: "numeric", hour12: false }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function ClientHome() {
  const portal = await getPortal();
  if (!portal) redirect("/login?redirect=/dashboard");
  const { user, client } = portal;
  const [items, requests, files, billing] = await Promise.all([
    clientAttention(client.id),
    clientRequestRows(client.id),
    clientFiles(client.id),
    clientBilling(client.id),
  ]);

  const active = requests.filter((r) => !["completed", "cancelled", "declined", "refunded"].includes(r.status));
  const done = requests.filter((r) => r.status === "completed");
  const year = new Date().getFullYear();
  const paidThisYear = billing.invoices
    .filter((i) => (i.paidAt ?? i.updatedAt).getFullYear() === year)
    .reduce((s, i) => s + Number(i.amountPaid ?? 0), 0);
  const outstanding = billing.invoices.filter((i) => ["sent", "viewed", "overdue", "partially_paid"].includes(i.status)).reduce((s, i) => s + balanceOf(i), 0);
  const quotesOpen = billing.quotes.filter((q) => ["sent", "viewed"].includes(q.status)).length;
  const team = [...new Map(active.flatMap((r) => r.team).map((t) => [t.id, t])).values()];
  const firstName = (user.name || "").split(/\s+/)[0] || "there";
  const fromUs = files.filter((f) => f.kind === "deliverable").slice(0, 4);

  return (
    <div className="space-y-6">
      <PageHead
        title={`${greeting()}, ${firstName}`}
        lede={
          items.length
            ? `${items.length} ${items.length === 1 ? "thing needs" : "things need"} you. Everything else is with us.`
            : requests.length
              ? "Nothing needs you right now. Everything is with us."
              : "Welcome to Litch. Start with a request and we take it from there."
        }
        actions={
          <Link href="/dashboard/requests/new" className={linkBtn.primary} data-tour="new-request">
            <Plus className="size-4" aria-hidden /> Request a service
          </Link>
        }
      />


      <div data-tour="attention">
        <AttentionList
          items={items}
          emptyTitle={requests.length ? "Nothing needs you" : "No requests yet"}
          emptyWhy={requests.length ? "Everything is with us. When we need you to approve, pay or upload something, it shows up here first." : "Tell us what you need. Fixed-price services start straight away; others get a quote within a working day."}
          emptyAction={
            requests.length ? undefined : (
              <Link href="/dashboard/requests/new" className={linkBtn.primary}>
                Request a service
              </Link>
            )
          }
        />
      </div>

      {/* R1.5 first-run checklist: below the queue, so real work stays first. Renders nothing once done or hidden. */}
      <Onboarding />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {active.slice(0, 3).map((r) => {
            const nn = nowNext(r.status);
            return (
              <Panel
                key={r.id}
                tour="request-card"
                title={r.serviceName}
                sub={r.number}
                right={
                  <Link href={`/dashboard/requests/${r.id}`} className={linkBtn.ghost}>
                    Open
                  </Link>
                }
              >
                <Stepper steps={requestSteps({ status: r.status, pricingMode: r.pricingMode, reviewRound: r.reviewRound })} />
                <p className="mt-4 text-sm text-body">
                  <b className="text-ink">Now:</b> {nn.now}. <b className="text-ink">Next:</b> {nn.next}.
                </p>
              </Panel>
            );
          })}
          {active.length > 3 ? (
            <Link href="/dashboard/requests" className={linkBtn.ghost}>
              See all {active.length} open requests
            </Link>
          ) : null}

          <Panel title="Recent files from us" right={<Link href="/dashboard/files" className={linkBtn.ghost}>All files</Link>}>
            {fromUs.length ? (
              <ul className="space-y-2">
                {fromUs.map((f) => (
                  <li key={f.id}>
                    <FileLink
                      href={`/api/dashboard/files/${f.id}`}
                      name={f.fileName}
                      meta={`${f.stage === "draft" ? "Draft" : "Final"} · ${formatDate(f.createdAt)} · ${f.requestNumber}`}
                      chip={f.stage === "draft" ? <StatusChip domain="deliverable" status="draft" audience="client" size="sm" /> : null}
                      blocked={f.scanStatus === "infected"}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact title="No files from us yet" why="Drafts and final files appear here the moment we send them." />
            )}
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="Billing" right={<Link href="/dashboard/billing" className={linkBtn.ghost}>Billing</Link>}>
            <KV
              rows={[
                [`Paid in ${year}`, formatMoney(paidThisYear)],
                ["Outstanding", formatMoney(outstanding)],
                ["Quotes to answer", String(quotesOpen)],
              ]}
            />
          </Panel>

          <Panel title="Your team at Litch">
            {team.length ? (
              <ul className="space-y-3">
                {team.map((t) => (
                  <li key={t.id} className="flex items-center gap-3">
                    <Initials name={t.name} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{t.name}</p>
                      <p className="text-xs text-muted">Replies within a working day</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-body">We assign a named person as soon as your request starts. Until then, Support reaches the whole team.</p>
            )}
            <Link href="/dashboard/support" className={`${linkBtn.small} mt-4 w-full`}>
              Message us
            </Link>
          </Panel>

          <Panel title="Need something else?">
            <p className="text-sm text-body">
              {done.length ? `Start a new request. Your files from ${done[0].serviceName} can come with it.` : "Start another request at any time."}
            </p>
            <Link href={done.length ? "/dashboard/files" : "/dashboard/requests/new"} className={`${linkBtn.small} mt-4 w-full`}>
              <RotateCcw className="size-3.5" aria-hidden /> Request again or add a service
            </Link>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
