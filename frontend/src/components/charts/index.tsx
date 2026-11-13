"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CATEGORICAL, SERIES, categorical } from "./palette";
import { formatMoney } from "@/lib/invoice/money";
import { cn } from "@/lib/utils";

/**
 * Brand-tokened, interactive Recharts wrappers (hover tooltips, responsive).
 * Colors from the CVD-validated palette. Recessive grid and axes: 3 to 5 faint
 * gridlines, straight 2 px lines, no dots, an area fade only under a single
 * line, no legend for one series. Text uses ink/muted tokens, never the
 * series color.
 */

/**
 * One tick style for every chart on the site: body font, 12 px, regular
 * weight, muted token, no stroke (a stroke on SVG text made it look bold).
 * Tabular figures come from the wrapper class (`CHART_TEXT`).
 */
const AXIS = { fill: "var(--color-muted)", fontSize: 12, fontWeight: 400, fontFamily: "var(--font-sans)", stroke: "none" };
const GRID = "var(--color-hairline)";
/** Applied to each chart wrapper so SVG text uses tabular figures and no tracking. */
const CHART_TEXT = "relative [&_.recharts-text]:tabular-nums [&_.recharts-text]:tracking-normal";
const Y_TICKS = 4; // with zero: 4 gridlines

/**
 * Value formatting is a serializable token, not a function — these charts are
 * client components rendered from RSC pages, and functions can't cross that
 * boundary. Resolved to a real formatter here on the client.
 */
export type ValueFormat = "money" | "number" | "percent";

function resolveFormat(format: ValueFormat = "number"): (v: number) => string {
  if (format === "money") return (v) => formatMoney(v);
  if (format === "percent") return (v) => `${Math.round(v)}%`;
  return (v) => v.toLocaleString("en-NG");
}

/** Short axis ticks: ₦5m, ₦250k, 1.2k, 40%. Full values stay in the tooltip. */
function resolveTick(format: ValueFormat = "number"): (v: number) => string {
  const compact = (v: number) => {
    const a = Math.abs(v);
    const sign = v < 0 ? "-" : "";
    const trim = (x: number) => (x >= 10 ? Math.round(x).toString() : x.toFixed(1).replace(/\.0$/, ""));
    if (a >= 1e9) return `${sign}${trim(a / 1e9)}bn`;
    if (a >= 1e6) return `${sign}${trim(a / 1e6)}m`;
    if (a >= 1e3) return `${sign}${trim(a / 1e3)}k`;
    return `${sign}${Math.round(a)}`;
  };
  if (format === "money") return (v) => `₦${compact(v)}`;
  if (format === "percent") return (v) => `${Math.round(v)}%`;
  return compact;
}

type TipEntry = { name?: string; value?: number | string; color?: string };
type TipProps = {
  active?: boolean;
  payload?: TipEntry[];
  label?: string | number;
  format?: ValueFormat;
};

/** Shared branded tooltip. `format` picks how each value renders. */
function ChartTooltip({ active, payload, label, format }: TipProps) {
  const fmt = resolveFormat(format);
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-hairline bg-paper px-3 py-2 text-xs shadow-xl shadow-black/10">
      {label != null && <p className="mb-1 font-semibold text-ink">{label}</p>}
      <ul className="space-y-0.5">
        {payload.map((p, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm" style={{ background: p.color }} />
            <span className="text-body">{p.name}</span>
            <span className="ml-auto font-semibold tabular-nums text-ink">
              {fmt(Number(p.value))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type SeriesDef = { key: string; label: string };

/** The series color, the same in the chart and in its key. */
function seriesColor(i: number): string {
  return i === 1 ? SERIES.secondary : categorical(i);
}

/**
 * Small inline key: an 8 px square in the series color and a 12 px muted label.
 * Put it next to the card title (`legend={false}` on the chart), or let the
 * chart show it above the plot. Never shown for one series.
 */
export function ChartKey({ series, className }: { series: SeriesDef[]; className?: string }) {
  if (series.length < 2) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-normal text-muted", className)}>
      {series.map((s, i) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-[2px]" style={{ background: seriesColor(i) }} />
          {s.label}
        </span>
      ))}
    </span>
  );
}

/** All values zero (or no rows): the chart draws only its zero line and a note. */
function isAllZero(data: Record<string, number | string>[], series: SeriesDef[]): boolean {
  return data.every((row) => series.every((s) => !Number(row[s.key])));
}

function EmptyNote({ text }: { text: string }) {
  return (
    <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-muted">{text}</p>
  );
}

/**
 * Time-series line chart (one or two series). Straight 2 px lines, no dots.
 * `curve="step"` suits running totals, which jump when money moves.
 * One series gets a faint area fade; two series get lines only.
 */
export function AreaTrend({
  data,
  series,
  height = 240,
  format,
  curve = "linear",
  legend = true,
  empty = "Nothing in this period.",
}: {
  data: Record<string, number | string>[];
  series: SeriesDef[];
  height?: number;
  format?: ValueFormat;
  curve?: "linear" | "step";
  /** false when the page shows <ChartKey> next to the card title. */
  legend?: boolean;
  /** The note shown over the zero line when every value is zero. */
  empty?: string;
}) {
  const zero = isAllZero(data, series);
  const fade = series.length === 1;
  return (
    <div className={CHART_TEXT}>
      {legend ? <ChartKey series={series} className="mb-2" /> : null}
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          {fade ? (
            <defs>
              <linearGradient id={`grad-${series[0].key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={seriesColor(0)} stopOpacity={0.18} />
                <stop offset="100%" stopColor={seriesColor(0)} stopOpacity={0} />
              </linearGradient>
            </defs>
          ) : null}
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} minTickGap={16} />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={AXIS}
            width={52}
            tickCount={zero ? 1 : Y_TICKS}
            domain={zero ? [0, 1] : [0, "auto"]}
            tickFormatter={resolveTick(format)}
          />
          {zero ? null : <Tooltip content={<ChartTooltip format={format} />} cursor={{ stroke: GRID }} />}
          {series.map((s, i) => (
            <Area
              key={s.key}
              type={curve === "step" ? "stepAfter" : "linear"}
              dataKey={s.key}
              name={s.label}
              stroke={seriesColor(i)}
              strokeWidth={2}
              fill={fade ? `url(#grad-${s.key})` : "none"}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      {zero ? <EmptyNote text={empty} /> : null}
    </div>
  );
}

/** Grouped/single vertical bars. Whole-number ticks for counts. */
export function GroupedBars({
  data,
  series,
  height = 240,
  format,
  legend = true,
  empty = "Nothing in this period.",
}: {
  data: Record<string, number | string>[];
  series: SeriesDef[];
  height?: number;
  format?: ValueFormat;
  /** false when the page shows <ChartKey> next to the card title. */
  legend?: boolean;
  /** The note shown over the zero line when every value is zero. */
  empty?: string;
}) {
  const zero = isAllZero(data, series);
  const counts = (format ?? "number") === "number";
  return (
    <div className={CHART_TEXT}>
      {legend ? <ChartKey series={series} className="mb-2" /> : null}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }} barGap={3} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} minTickGap={8} />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={AXIS}
            width={52}
            allowDecimals={!counts}
            tickCount={zero ? 1 : Y_TICKS}
            domain={zero ? [0, 1] : [0, "dataMax"]}
            tickFormatter={resolveTick(format)}
          />
          {zero ? null : <Tooltip content={<ChartTooltip format={format} />} cursor={{ fill: "var(--color-surface)" }} />}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={seriesColor(i)} radius={[3, 3, 0, 0]} maxBarSize={36} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      {zero ? <EmptyNote text={empty} /> : null}
    </div>
  );
}

/**
 * Composition donut with center total. Segment colors come from the categorical
 * palette (order matches `data`), so a caller that renders its own breakdown can
 * set `legend={false}` and colour its swatches with `CATEGORICAL[i]` to match.
 */
export function Donut({
  data,
  height = 240,
  centerLabel,
  centerValue,
  format,
  legend = true,
}: {
  data: { label: string; value: number }[];
  height?: number;
  centerLabel?: string;
  centerValue?: string;
  format?: ValueFormat;
  legend?: boolean;
}) {
  return (
    <div className={CHART_TEXT}>
      <div className="relative" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<ChartTooltip format={format} />} />
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="68%"
              outerRadius="90%"
              paddingAngle={2}
              stroke="var(--color-paper)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={categorical(i)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {(centerLabel || centerValue) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {centerValue && <span className="font-display text-xl font-bold text-ink">{centerValue}</span>}
            {centerLabel && <span className="max-w-[7rem] text-xs text-muted">{centerLabel}</span>}
          </div>
        )}
      </div>
      {legend && data.length > 1 ? (
        <span className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-muted">
          {data.map((d, i) => (
            <span key={d.label} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-[2px]" style={{ background: categorical(i) }} />
              {d.label}
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
}

export { CATEGORICAL };
export { PeriodFilter, type Period } from "./period-filter";
