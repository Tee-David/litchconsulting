import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { requireArea } from "@/lib/server-user";
import { sageQuality } from "@/lib/sage/quality";
import { getEvalCases, type EvalCaseRow } from "@/lib/litchai/client";
import { EmptyState } from "@/components/kit";
import { Kpi, PageHead, Panel } from "@/components/admin/ui/surface";
import { UrlSegmented } from "@/components/admin/ui/url-segmented";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sage answer quality" };
export const dynamic = "force-dynamic";

const ROUTE_LABEL: Record<string, string> = {
  decision: "Decision layer",
  model: "Model router",
  semantic: "Semantic router",
  keyword: "Keyword match",
  unknown: "Not recorded",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

/**
 * H1: how Sage's answers were rated. Bad answers are counted by route, tool and
 * model, so a routing mistake shows up as a cluster, and each one links back to
 * the chat or the workbench where it happened.
 */
export default async function SageQualityPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await requireArea("sage", "/admin/sage/quality");
  if (user.role !== "admin") redirect("/admin/sage");
  const sp = await searchParams;
  const days = sp.days === "30" ? 30 : 7;
  const q = await sageQuality(days);
  // The edge-case scorecard lives on the engine; the page works without it.
  const cases: EvalCaseRow[] | null = await getEvalCases().catch(() => null);
  const total = q.good + q.bad;
  const rate = total ? Math.round((q.good / total) * 100) : null;

  return (
    <div className="space-y-5">
      <PageHead
        title="Sage answer quality"
        lede={`Good and Bad votes on Sage's answers in the last ${days} days, on the Sage page and in the workbench.`}
        actions={
          <UrlSegmented
            param="days"
            label="Period"
            value={String(days) as "7" | "30"}
            options={[
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
            ]}
          />
        }
      />

      {q.engineMissing ? (
        <p className="rounded-ctl border border-hairline bg-warn-soft px-3 py-2 text-sm text-ink" role="status">
          The analysis server did not answer, so workbench votes are not in these figures. Sage page votes are.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
        <Kpi label="Good answers" value={String(q.good)} note={`in the last ${days} days`} />
        <Kpi label="Bad answers" value={String(q.bad)} note={q.bad ? "see the list below" : "none"} noteTone={q.bad ? "bad" : "muted"} />
        <Kpi label="Rated good" value={rate === null ? "—" : `${rate}%`} note={total ? `${total} votes` : "No votes yet"} noteTone={rate !== null && rate < 80 ? "warn" : "muted"} />
      </div>

      {total === 0 ? (
        <Panel title="No votes yet">
          <EmptyState
            title="Nobody has rated an answer in this period"
            why="Under each Sage answer, Good and Bad record how it went. Bad asks for a short note. Votes show here with what produced the answer."
          />
        </Panel>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-3">
            {(
              [
                ["Bad answers by route", q.badBy.route, (k: string) => ROUTE_LABEL[k] ?? k],
                ["Bad answers by tool", q.badBy.tool, (k: string) => k],
                ["Bad answers by model", q.badBy.model, (k: string) => k],
              ] as const
            ).map(([title, rows, label]) => (
              <Panel key={title} title={title}>
                {rows.length ? (
                  <ul className="divide-y divide-hairline">
                    {rows.map(([k, n]) => (
                      <li key={k} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span className="min-w-0 truncate text-ink">{label(k)}</span>
                        <span className="tabular-nums font-semibold text-bad">{n}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-2 text-sm text-muted">No bad answers.</p>
                )}
              </Panel>
            ))}
          </div>

          <Panel title="Every vote" sub={`${q.votes.length} in the last ${days} days, newest first`}>
            <ul className="divide-y divide-hairline">
              {q.votes.slice(0, 200).map((v, i) => (
                <li key={`${v.href}-${v.at}-${i}`} className="flex gap-3 py-3">
                  <span
                    className={cn("grid size-8 shrink-0 place-items-center rounded-ctl", v.vote === "good" ? "bg-good-soft text-good" : "bg-bad-soft text-bad")}
                    aria-label={v.vote === "good" ? "Good" : "Bad"}
                  >
                    {v.vote === "good" ? <ThumbsUp className="size-4" /> : <ThumbsDown className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{v.question || "(no question saved)"}</p>
                    {v.note ? <p className="mt-0.5 text-sm text-body">&ldquo;{v.note}&rdquo;</p> : null}
                    <p className="mt-1 text-[12.5px] text-muted">
                      {v.source} · {when(v.at)} · {ROUTE_LABEL[v.route] ?? v.route} · {v.tool} · {v.model}
                    </p>
                  </div>
                  <Link href={v.href} className="shrink-0 self-center text-sm font-medium text-accent hover:underline dark:text-info">
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}

      <Panel title="Test cases" sub="Realistic client jobs with planted problems (fictional data). The latest run per case and model.">
        {cases === null ? (
          <p className="py-2 text-sm text-muted">The analysis server did not answer, so the test results cannot show now.</p>
        ) : cases.length === 0 ? (
          <p className="py-2 text-sm text-muted">No test runs saved yet. Runs from the analysis server show here.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {[...cases].sort((a, b) => a.case.localeCompare(b.case) || a.chain.localeCompare(b.chain)).map((c) => (
              <li key={`${c.case}-${c.chain}`} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-3">
                <span
                  className={cn(
                    "grid h-8 min-w-14 shrink-0 place-items-center rounded-ctl px-2 text-sm font-semibold tabular-nums",
                    c.found_pct >= 80 ? "bg-good-soft text-good" : c.found_pct >= 50 ? "bg-warn-soft text-warn" : "bg-bad-soft text-bad",
                  )}
                  aria-label={`${c.found} of ${c.of} problems found`}
                >
                  {c.found}/{c.of}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    {c.client ?? c.case} <span className="font-normal text-muted">· {CHAIN_LABEL[c.chain] ?? c.chain}</span>
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    {c.model_turns} of {c.turns} answers by the model · {c.unusable} unusable repl{c.unusable === 1 ? "y" : "ies"} ·{" "}
                    {c.tokens.toLocaleString("en-NG")} tokens · {c.seconds}s · {when(c.at)}
                    {c.trend.length > 1 ? ` · trend ${c.trend.slice(-5).join("% → ")}%` : ""}
                  </p>
                  {c.missed.length ? <p className="mt-0.5 text-[12.5px] text-body">Missed: {c.missed.join("; ")}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

const CHAIN_LABEL: Record<string, string> = { groq: "Groq (free models)", deepseek: "DeepSeek" };
