import Link from "next/link";
import { Plus } from "lucide-react";
import { requireArea } from "@/lib/server-user";
import { buildAdminAttention } from "@/lib/attention/admin";
import { formatMoney } from "@/lib/invoice/money";
import { AttentionList } from "@/components/kit";
import { AreaTrend, GroupedBars } from "@/components/charts";
import { ActLink, Kpi, PageHead, Panel } from "@/components/admin/ui/surface";
import { UrlSegmented } from "@/components/admin/ui/url-segmented";
import { homeData, isHomePeriod, type HomePeriod } from "./_lib/home-data";
import {
  assignMe,
  dismissEmail,
  followUpQuote,
  markReceived,
  remindInvoice,
  remindReview,
  retryEmail,
  undoAttention,
} from "./attention-actions";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PERIOD_TEXT: Record<HomePeriod, { label: string; now: string; prev: string; chart: string }> = {
  week: { label: "Week", now: "last 7 days", prev: "the 7 days before", chart: "last 7 days" },
  month: { label: "Month", now: "last 30 days", prev: "the 30 days before", chart: "last 30 days" },
  year: { label: "Year", now: "last 12 months", prev: "the 12 months before", chart: "last 12 months" },
};

function short(n: number) {
  if (n >= 1e9) return `₦${(n / 1e9).toFixed(2)}bn`;
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(2)}m`;
  if (n >= 1e3) return `₦${Math.round(n / 1e3)}k`;
  return formatMoney(n);
}

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await requireArea("home", "/admin");
  const sp = await searchParams;
  const period: HomePeriod = isHomePeriod(sp.period) ? sp.period : "month";
  const [items, d] = await Promise.all([buildAdminAttention(), homeData(period)]);
  const P = PERIOD_TEXT[period];

  const hour = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = (user.name || "there").split(" ")[0];

  const change = d.collectedPrev > 0 ? Math.round(((d.collected - d.collectedPrev) / d.collectedPrev) * 100) : null;
  const onTimePct = d.deliveredCount ? Math.round((d.onTime / d.deliveredCount) * 100) : null;
  const stageMax = Math.max(1, ...d.stages.map((s) => s.n));
  const hasMoney = d.money.some((m) => m.billed || m.collected);
  const hasFlow = d.flow.some((f) => f.opened || f.delivered);

  return (
    <div className="space-y-5">
      <PageHead
        title={`${greeting}, ${first}`}
        lede={
          items.length === 0
            ? "Nothing needs you right now. The numbers are below."
            : `${items.length} ${items.length === 1 ? "thing needs" : "things need"} you. The worst is at the top.`
        }
        actions={
          <>
            <UrlSegmented
              param="period"
              label="Period for figures and charts"
              value={period}
              options={(["week", "month", "year"] as const).map((v) => ({ value: v, label: PERIOD_TEXT[v].label }))}
            />
            <ActLink href="/admin/billing/quotes/new">
              <Plus /> New quote
            </ActLink>
          </>
        }
      />

      <div data-tour="needs-action">
        <AttentionList
          items={items}
          actions={{ remindInvoice, followUpQuote, remindReview, assignMe, markReceived, retryEmail, dismissEmail }}
          undo={undoAttention}
          emptyWhy="No transfers to confirm, nothing late, no client waiting. New items appear here the moment they need a decision."
          emptyAction={
            <Link href="/admin/requests" className="text-sm font-medium text-accent hover:underline">
              Look at open requests
            </Link>
          }
        />
      </div>

      <div data-tour="kpi-stats" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label={`Collected, ${P.now}`}
          value={short(d.collected)}
          note={change === null ? `Nothing collected in ${P.prev}` : `${change >= 0 ? "+" : ""}${change}% on ${P.prev}`}
          noteTone={change === null ? "muted" : change >= 0 ? "good" : "bad"}
          href="/admin/billing/payments"
        />
        <Kpi
          label="Owed to us"
          value={short(d.owedTotal)}
          note={d.lateCount ? `${formatMoney(d.lateTotal)} late · ${d.owedCount} invoices` : `${d.owedCount} invoices, none late`}
          noteTone={d.lateCount ? "bad" : "muted"}
          href="/admin/billing?view=unpaid"
        />
        <Kpi
          label="Open requests"
          value={String(d.openTotal)}
          note={`${d.withUs} with us · ${d.withClient} with clients · ${Math.max(0, d.openTotal - d.withUs - d.withClient)} other`}
          href="/admin/requests"
        />
        <Kpi
          label="Delivered on time"
          value={onTimePct === null ? "—" : `${onTimePct}%`}
          note={d.deliveredCount ? `${d.onTime} of ${d.deliveredCount} in the last 90 days` : "Nothing delivered in the last 90 days"}
          noteTone={onTimePct !== null && onTimePct < 80 ? "warn" : "muted"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Panel
            tour="billed-collected"
            title="Billed and collected"
            sub={P.chart}
            action={
              <Link href="/admin/billing" className="text-sm font-medium text-accent hover:underline">
                Billing
              </Link>
            }
          >
            {hasMoney ? (
              <AreaTrend
                data={d.money}
                series={[
                  { key: "billed", label: "Billed" },
                  { key: "collected", label: "Collected" },
                ]}
                format="money"
              />
            ) : (
              <p className="py-10 text-center text-sm text-body">No invoices issued or payments received in the {P.chart}.</p>
            )}
          </Panel>
          <Panel title="Requests opened and delivered" sub={P.chart}>
            {hasFlow ? (
              <GroupedBars
                data={d.flow}
                series={[
                  { key: "opened", label: "Opened" },
                  { key: "delivered", label: "Delivered" },
                ]}
              />
            ) : (
              <p className="py-10 text-center text-sm text-body">No requests opened or delivered in the {P.chart}.</p>
            )}
          </Panel>
        </div>
        <div className="space-y-5">
          <Panel tour="pipeline" title="Where requests are" sub={`${d.openTotal} open`}>
            <ul className="space-y-2.5">
              {d.stages.map((s) => (
                <li key={s.label} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2rem] items-center gap-3 text-sm">
                  <span className="text-body">{s.label}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-surface" aria-hidden>
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        s.tone === "warn" ? "bg-warn" : s.tone === "info" ? "bg-info" : s.tone === "good" ? "bg-good" : "bg-act",
                      )}
                      style={{ width: `${(s.n / stageMax) * 100}%` }}
                    />
                  </span>
                  <span className="text-right font-semibold tabular-nums text-ink">{s.n}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Team load" sub="open requests per person">
            {d.teamLoad.length === 0 ? (
              <p className="text-sm text-body">
                Nobody has requests assigned yet. Assign from{" "}
                <Link href="/admin/requests" className="font-medium text-accent hover:underline">
                  Requests
                </Link>
                .
              </p>
            ) : (
              <ul className="divide-y divide-hairline">
                {d.teamLoad.map((t) => (
                  <li key={t.name} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-tint text-xs font-semibold text-brand">
                      {t.name
                        .split(/\s+/)
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{t.name}</span>
                    <span className="text-sm tabular-nums text-body">{t.open} open</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
