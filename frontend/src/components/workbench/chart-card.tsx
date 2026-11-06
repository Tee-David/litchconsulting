"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Check, Loader2, Plus, X } from "lucide-react";
import { CATEGORICAL } from "@/components/charts/palette";
import { Button } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { decideBatchAction, runToolAction } from "@/lib/workbench/actions";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";

type Series = { name: string; ref: string; data: Array<number | null> };
export type ChartProposal = {
  batchId: string;
  preview: { spec: Record<string, unknown>; labels: string[]; series: Series[]; rows: Array<Record<string, string | number | null>>; format: "money" | "number" | "percent" };
  spec: Record<string, unknown>;
};

const TYPES = [
  ["column", "Column"],
  ["stacked", "Stacked"],
  ["bar", "Bar"],
  ["line", "Line"],
  ["area", "Area"],
  ["pie", "Pie"],
] as const;

const short = (v: number, fmt: string) =>
  fmt === "percent"
    ? `${(v * 100).toFixed(0)}%`
    : Math.abs(v) >= 1e9 ? `${(v / 1e9).toFixed(1)}bn`
    : Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}m`
    : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(0)}k`
    : String(v);

/**
 * A chart Sage proposed: previewed here from the same cells, with type, title
 * and series editable. Insert accepts it as a native Excel chart linked to its
 * range (it updates when the numbers change); nothing lands until then.
 */
export function ChartCard({
  conversationId,
  proposal,
  sheets,
  busy,
  onReplace,
  onDecide,
}: {
  conversationId: string;
  proposal: ChartProposal;
  sheets: string[];
  busy: boolean;
  onReplace: (next: ChartProposal) => void;
  onDecide: (action: "accept" | "reject") => void;
}) {
  const toast = useToast();
  const spec = { ...(proposal.preview.spec ?? proposal.spec) } as Record<string, unknown> & { type: string; title: string; sheet: string; anchor?: string; series: Array<{ name: string; ref: string }> };
  const [title, setTitle] = useState(String(spec.title ?? ""));
  const [working, setWorking] = useState(false);
  const [addRef, setAddRef] = useState("");
  const fmt = proposal.preview.format ?? "money";
  const rows = proposal.preview.rows;
  const names = proposal.preview.series.map((s) => s.name);

  /** Change the proposal: propose the new chart, then withdraw the old one. */
  const repropose = async (patch: Record<string, unknown>) => {
    setWorking(true);
    const next = { ...spec, ...patch };
    const res = await runToolAction({
      conversationId,
      tool: "add_chart",
      args: { type: next.type, title: next.title, categories: next.categories, series: next.series, sheet: next.sheet, anchor: next.anchor, y_format: next.y_format },
    });
    if (!res.ok || !res.batch || !res.chartPreview) {
      setWorking(false);
      toast.error(res.ok ? "Sage could not redraw that chart." : res.error);
      return;
    }
    await decideBatchAction({ conversationId, batchId: proposal.batchId, action: "reject" });
    setWorking(false);
    onReplace({ batchId: res.batch.id, preview: res.chartPreview as ChartProposal["preview"], spec: (res.data.spec ?? {}) as Record<string, unknown> });
  };

  const axis = { fontSize: 11, fill: "var(--color-muted)" };
  const tick = (v: number) => short(v, fmt);
  const tip = (v: unknown) => (typeof v === "number" ? (fmt === "money" ? `₦${v.toLocaleString("en-NG", { maximumFractionDigits: 2 })}` : short(v, fmt)) : String(v));

  const chart = (() => {
    const grid = <CartesianGrid stroke="var(--color-hairline)" vertical={false} />;
    const common = { data: rows, margin: { top: 8, right: 8, bottom: 0, left: 0 } };
    if (spec.type === "pie") {
      const s = names[0];
      return (
        <PieChart>
          <Pie data={rows} dataKey={s} nameKey="label" innerRadius="45%" outerRadius="80%" paddingAngle={1}>
            {rows.map((_, i) => <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />)}
          </Pie>
          <Tooltip formatter={tip} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      );
    }
    if (spec.type === "line" || spec.type === "area") {
      const C = spec.type === "line" ? LineChart : AreaChart;
      return (
        <C {...common}>
          {grid}
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={axis} tickFormatter={tick} tickLine={false} axisLine={false} width={44} />
          <Tooltip formatter={tip} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {names.map((n, i) =>
            spec.type === "line" ? (
              <Line key={n} dataKey={n} stroke={CATEGORICAL[i % CATEGORICAL.length]} strokeWidth={2} dot={false} />
            ) : (
              <Area key={n} dataKey={n} stroke={CATEGORICAL[i % CATEGORICAL.length]} fill={CATEGORICAL[i % CATEGORICAL.length]} fillOpacity={0.15} />
            ),
          )}
        </C>
      );
    }
    const horizontal = spec.type === "bar";
    return (
      <BarChart {...common} layout={horizontal ? "vertical" : "horizontal"}>
        {grid}
        {horizontal ? (
          <>
            <XAxis type="number" tick={axis} tickFormatter={tick} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="label" tick={axis} width={80} tickLine={false} axisLine={false} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={axis} tickFormatter={tick} tickLine={false} axisLine={false} width={44} />
          </>
        )}
        <Tooltip formatter={tip} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {names.map((n, i) => (
          <Bar key={n} dataKey={n} fill={CATEGORICAL[i % CATEGORICAL.length]} radius={2} stackId={spec.type === "stacked" ? "s" : undefined} />
        ))}
      </BarChart>
    );
  })();

  return (
    <section className="rounded-card border border-hairline bg-paper" aria-label="Chart proposal">
      <header className="flex items-center gap-2 border-b border-hairline px-3 py-2">
        <BarChart3 className="size-4 text-muted" aria-hidden />
        <h3 className="text-[13px] font-semibold text-ink">Chart proposal</h3>
        <span className="ml-auto rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-medium text-info">Preview</span>
      </header>
      <div className="space-y-2.5 px-3 py-2.5">
        <div role="radiogroup" aria-label="Chart type" className="flex flex-wrap gap-1">
          {TYPES.map(([v, l]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={spec.type === v}
              disabled={working || busy || (v === "pie" && names.length > 1)}
              onClick={() => spec.type !== v && void repropose({ type: v })}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[12px] disabled:opacity-40",
                spec.type === v ? "border-act bg-act text-act-ink" : "border-hairline text-body hover:bg-cloud",
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <label className="block text-[12px]">
          <span className="mb-0.5 block text-muted">Title</span>
          <input
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title.trim() !== spec.title && void repropose({ title: title.trim() })}
            className="w-full rounded-ctl border border-hairline bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus:border-act"
          />
        </label>
        <div className="relative h-56 w-full" aria-label={`${spec.title}: ${spec.type} chart`} role="img">
          {working ? (
            <div className="absolute inset-0 z-10 grid place-items-center bg-paper/70"><Loader2 className="size-5 animate-spin text-muted" /></div>
          ) : null}
          <ResponsiveContainer width="100%" height="100%">{chart}</ResponsiveContainer>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11.5px] text-muted">Series</span>
          {spec.series.map((s, i) => (
            <span key={s.ref} className="inline-flex items-center gap-1 rounded-full border border-hairline px-2 py-0.5 text-[11.5px] text-ink">
              <i className="size-2 rounded-full" style={{ background: CATEGORICAL[i % CATEGORICAL.length] }} />
              {s.name} <span className="font-mono text-[10.5px] text-muted">{s.ref}</span>
              {spec.series.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Remove series ${s.name}`}
                  disabled={working || busy}
                  onClick={() => void repropose({ series: spec.series.filter((x) => x.ref !== s.ref) })}
                  className="rounded-full p-0.5 text-muted hover:bg-cloud hover:text-ink"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </span>
          ))}
          <form
            className="inline-flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const ref = addRef.trim();
              if (!/^.+!\$?[A-Za-z]{1,3}\$?\d+:\$?[A-Za-z]{1,3}\$?\d+$/.test(ref)) {
                toast.error("Write the series range as Sheet!C2:C13.");
                return;
              }
              setAddRef("");
              void repropose({ series: [...spec.series, { name: `Series ${spec.series.length + 1}`, ref }] });
            }}
          >
            <input
              value={addRef}
              onChange={(e) => setAddRef(e.target.value)}
              placeholder="Sheet!D2:D13"
              aria-label="Add a series range"
              className="w-28 rounded-full border border-hairline bg-surface px-2 py-0.5 font-mono text-[11px] text-ink outline-none focus:border-act"
            />
            <button type="submit" aria-label="Add series" className="rounded-full p-1 text-muted hover:bg-cloud hover:text-ink" disabled={working || busy}>
              <Plus className="size-3.5" />
            </button>
          </form>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="primary" disabled={working || busy} onClick={() => onDecide("accept")}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Insert into {spec.sheet}
            {spec.anchor ? ` at ${spec.anchor}` : ""}
          </Button>
          {sheets.filter((n) => n !== spec.sheet).length ? (
            <Select
              aria-label="Move the chart to another sheet"
              disabled={working || busy}
              value=""
              placeholder="Other sheet…"
              onChange={(v) => v && void repropose({ sheet: v })}
              options={sheets.filter((n) => n !== spec.sheet).map((n) => ({ value: n, label: n }))}
              className="min-w-[9rem]"
            />
          ) : null}
          <Button size="sm" variant="ghost" disabled={working || busy} onClick={() => onDecide("reject")}>Discard</Button>
        </div>
        <p className="text-[11px] text-muted">Drawn here for preview. In the file it is a native Excel chart linked to its cells, so the client can edit it.</p>
      </div>
    </section>
  );
}
