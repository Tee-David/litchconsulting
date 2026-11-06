import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { PlugZap, Sparkles } from "lucide-react";
import { db } from "@/lib/db/client";
import { client, serviceRequest, serviceRequestDocument } from "@/lib/db/schema";
import { Kpi, PageHead, Panel } from "@/components/admin/ui/surface";
import { EmptyState } from "@/components/kit";
import { AreaTrend, Donut, GroupedBars } from "@/components/charts";
import { EngagementPanel } from "@/components/admin/analyses/engagement-panel";
import { ReviewStatusBanner } from "@/components/admin/analyses/review-status-banner";
import { AnalysisActions } from "@/components/admin/analyses/analysis-actions";
import { AnalysisBody } from "@/components/admin/analyses/analysis-body";
import { formatMoney } from "@/lib/invoice/money";
import {
  getInsights,
  getReview,
  getTaxonomy,
  type DocumentInsights,
  type ReviewData,
  type TaxonomyCategory,
} from "@/lib/litchai/client";

export const dynamic = "force-dynamic";

const DONE = new Set(["categorized", "extracted"]);
const dateLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * Analysis result: what the AI found in one client file. Key figures, findings
 * (each with why and the lines it is about), charts, a short summary, then the
 * lines to review. Every figure is computed by the engine, never by a model.
 * Until the engine serves insights, the figures are computed here from the lines.
 */
export default async function AnalysisResultPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const id = Number(documentId);
  // Only numeric engine ids are documents ("/analyses/w" and the like are not).
  if (!Number.isInteger(id) || id <= 0) redirect("/admin/analyses");

  let review: ReviewData | null = null;
  let categories: TaxonomyCategory[] = [];
  let insights: DocumentInsights | null = null;
  let error: string | null = null;
  try {
    const [r, t, ins] = await Promise.all([getReview(id), getTaxonomy(), getInsights(id).catch(() => null)]);
    review = r;
    categories = t.categories;
    insights = ins;
  } catch (e) {
    error = e instanceof Error ? e.message : "unreachable";
  }

  if (!review) {
    return (
      <div>
        <PageHead title="Analysis" />
        <EmptyState
          icon={<PlugZap />}
          title="The AI server did not answer"
          why={/404/.test(error ?? "") ? "This file is not on the AI server. Go back to Analyses and open it again." : "Try again in a minute. If it keeps failing, check AI health on the Analyses page."}
          action={<Link href="/admin/analyses" className="text-sm font-medium text-accent underline">Back to Analyses</Link>}
        />
      </div>
    );
  }

  // The request (and client) this file came from, from our side of the relay.
  const [link] = await db
    .select({ requestId: serviceRequest.id, number: serviceRequest.number, docId: serviceRequestDocument.id, company: client.company, name: client.name, clientId: serviceRequest.clientId })
    .from(serviceRequestDocument)
    .innerJoin(serviceRequest, eq(serviceRequestDocument.requestId, serviceRequest.id))
    .leftJoin(client, eq(client.id, serviceRequest.clientId))
    .where(eq(serviceRequestDocument.litchaiDocumentId, String(id)))
    .limit(1);
  const clientName = link ? link.company || link.name || "Client" : "Uploaded directly";
  const doc = review.document;
  const lines = review.line_items;
  const currency = insights?.currency ?? "NGN";
  const label = new Map(categories.map((c) => [c.code, c.label]));

  // Figures: from the engine when it has them, else from the lines.
  const moneyIn = insights?.figures.money_in ?? lines.filter((l) => l.direction === "in").reduce((s, l) => s + l.amount, 0);
  const moneyOut = insights?.figures.money_out ?? lines.filter((l) => l.direction === "out").reduce((s, l) => s + l.amount, 0);
  const needs = insights?.figures.needs_review ?? lines.filter((l) => l.needs_review).length;
  const byCategory = (insights?.by_category ?? (() => {
    const m = new Map<string, number>();
    for (const l of lines) if (l.category_code) m.set(l.category_code, (m.get(l.category_code) ?? 0) + l.amount);
    return [...m.entries()].map(([code, total]) => ({ code, label: label.get(code) ?? code, total, lines: 0 }));
  })())
    .slice()
    .sort((a, b) => b.total - a.total);
  const donut = [...byCategory.slice(0, 6).map((c) => ({ label: c.label, value: c.total })), ...(byCategory.length > 6 ? [{ label: "Other", value: byCategory.slice(6).reduce((s, c) => s + c.total, 0) }] : [])];
  const months = (insights?.by_month ?? []).map((m) => ({ label: new Date(`${m.month}-01T12:00:00`).toLocaleDateString("en-GB", { month: "short" }), in: m.in, out: m.out }));
  const period = insights?.period ? `${dateLabel(insights.period.start)} to ${dateLabel(insights.period.end)}` : null;
  const ready = DONE.has(doc.status);
  const f = insights?.figures;

  // "Where the figures come from", in words.
  const sources = review.lineage
    .filter((g) => g.item_count > 0)
    .sort((a, b) => b.item_count - a.item_count)
    .map((g) => {
      const people = g.by_source.human ?? 0;
      const ai = g.item_count - people;
      return `${label.get(g.figure) ?? g.figure.replace(/[._]/g, " ")}: ${g.item_count} ${g.item_count === 1 ? "line" : "lines"} (${[ai ? `${ai} set by AI` : "", people ? `${people} by a person` : ""].filter(Boolean).join(", ")})`;
    });

  return (
    <div>
      <PageHead
        title={doc.filename}
        lede={
          <span className="text-[14px]">
            {link ? (
              <>
                <Link href={`/admin/clients/${link.clientId}`} className="text-accent hover:underline">{clientName}</Link>
                {" · "}
                <Link href={`/admin/requests/${link.requestId}`} className="text-accent hover:underline">{link.number}</Link>
              </>
            ) : (
              clientName
            )}
            {period ? ` · ${period}` : ""}
          </span>
        }
        meta={
          <span className={ready ? (needs ? "rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn" : "rounded-full bg-good-soft px-2 py-0.5 text-xs font-medium text-good") : "rounded-full bg-info-soft px-2 py-0.5 text-xs font-medium text-info"}>
            {ready ? (needs ? `${needs} ${needs === 1 ? "line needs" : "lines need"} you` : "Ready") : "Reading"}
          </span>
        }
        actions={<AnalysisActions documentId={id} clientId={doc.client_id || link?.clientId || ""} engagementId={doc.engagement_id} ready={ready} />}
      />

      {!ready && (
        <div className="mb-5">
          <ReviewStatusBanner documentId={id} initialStatus={doc.status} retryTarget={link ? { requestId: link.requestId, docId: link.docId } : null} />
        </div>
      )}

      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {f?.opening_balance != null && f?.closing_balance != null ? (
            <>
              <Kpi label="Opening balance" value={formatMoney(f.opening_balance, currency)} />
              <Kpi label="Closing balance" value={formatMoney(f.closing_balance, currency)} note={f.balance_ok === false ? "The running balance breaks" : f.balance_ok ? "The running balance agrees" : undefined} noteTone={f.balance_ok === false ? "bad" : "good"} />
            </>
          ) : (
            <>
              <Kpi label="Money in" value={formatMoney(moneyIn, currency)} noteTone="good" />
              <Kpi label="Money out" value={formatMoney(moneyOut, currency)} />
            </>
          )}
          <Kpi label="Net" value={formatMoney(moneyIn - moneyOut, currency)} noteTone={moneyIn - moneyOut < 0 ? "bad" : "good"} note={moneyIn - moneyOut < 0 ? "More out than in" : "More in than out"} />
          <Kpi label="Lines read" value={String(f?.lines ?? lines.length)} note={needs ? `${needs} need review` : "All checked"} noteTone={needs ? "warn" : "good"} />
        </div>

        {insights?.summary ? (
          <Panel title={<span className="inline-flex items-center gap-2"><Sparkles className="size-4 text-accent" aria-hidden /> Summary</span>} sub={insights.summary_by === "model" ? "Written by Sage from the figures on this page" : "Built from the figures on this page. No model was used."}>
            <p className="max-w-[80ch] text-sm leading-relaxed text-body">{insights.summary}</p>
          </Panel>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Panel title="Money in and out by month">
            {months.length > 1 ? (
              <GroupedBars data={months} series={[{ key: "in", label: "In" }, { key: "out", label: "Out" }]} format="money" height={220} />
            ) : months.length === 1 ? (
              <AreaTrend data={months.map((m) => ({ label: m.label, net: m.in - m.out }))} series={[{ key: "net", label: "Net" }]} format="money" height={220} />
            ) : (
              <p className="text-sm text-body">The months show when the AI server has finished its checks on this file.</p>
            )}
          </Panel>
          <Panel title="By category">
            {donut.length ? <Donut data={donut} height={220} format="money" /> : <p className="text-sm text-body">No categories yet.</p>}
          </Panel>
        </div>

        {insights && (insights.counterparties.customers.length > 0 || insights.counterparties.suppliers.length > 0) ? (
          <div className="grid gap-5 md:grid-cols-2">
            {(["customers", "suppliers"] as const).map((k) => (
              <Panel key={k} title={k === "customers" ? "Top customers" : "Top suppliers"} bodyClassName="p-0">
                <ul className="divide-y divide-hairline">
                  {insights!.counterparties[k].map((c) => (
                    <li key={c.name} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                      <span className="min-w-0 truncate text-ink">{c.name}</span>
                      <span className="shrink-0 tabular-nums text-body">
                        {formatMoney(c.total, currency)} <span className="text-muted">· {Math.round(c.share * 100)}%</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>
        ) : null}

        <AnalysisBody documentId={id} findings={insights?.findings ?? []} lines={lines} categories={categories} currency={currency} />

        {sources.length ? (
          <Panel title="Where the figures come from">
            <ul className="space-y-1.5 text-sm text-body">
              {sources.map((s) => <li key={s}>{s}</li>)}
            </ul>
          </Panel>
        ) : null}

        {doc.engagement_id !== null && <EngagementPanel documentId={id} engagementId={doc.engagement_id} />}
      </div>
    </div>
  );
}
