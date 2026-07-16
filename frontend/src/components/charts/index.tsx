"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CATEGORICAL, SERIES, categorical } from "./palette";

/**
 * Brand-tokened, interactive Recharts wrappers (hover tooltips, legends,
 * responsive). Colors from the CVD-validated palette. Recessive grid/axes;
 * text uses ink/muted tokens, never the series color.
 */

const AXIS = { stroke: "var(--color-muted)", fontSize: 11 };
const GRID = "var(--color-hairline)";

type TipEntry = { name?: string; value?: number | string; color?: string };
type TipProps = {
  active?: boolean;
  payload?: TipEntry[];
  label?: string | number;
  fmt?: (v: number) => string;
};

/** Shared branded tooltip. `fmt` formats each value (money, count, etc.). */
function ChartTooltip({ active, payload, label, fmt = (v: number) => String(v) }: TipProps) {
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

/** Time-series area chart (one or two series). */
export function AreaTrend({
  data,
  series,
  height = 240,
  fmt,
}: {
  data: Record<string, number | string>[];
  series: SeriesDef[];
  height?: number;
  fmt?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {series.map((s, i) => {
            const c = i === 1 ? SERIES.secondary : categorical(i);
            return (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c} stopOpacity={0.28} />
                <stop offset="100%" stopColor={c} stopOpacity={0.02} />
              </linearGradient>
            );
          })}
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} />
        <YAxis tickLine={false} axisLine={false} tick={AXIS} width={44} />
        <Tooltip content={<ChartTooltip fmt={fmt} />} cursor={{ stroke: GRID }} />
        {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => {
          const c = i === 1 ? SERIES.secondary : categorical(i);
          return (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={c}
              strokeWidth={2}
              fill={`url(#grad-${s.key})`}
              dot={false}
              activeDot={{ r: 4 }}
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Grouped/single vertical bars. */
export function GroupedBars({
  data,
  series,
  height = 240,
  fmt,
}: {
  data: Record<string, number | string>[];
  series: SeriesDef[];
  height?: number;
  fmt?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS} />
        <YAxis tickLine={false} axisLine={false} tick={AXIS} width={44} />
        <Tooltip content={<ChartTooltip fmt={fmt} />} cursor={{ fill: "var(--color-surface)" }} />
        {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={i === 1 ? SERIES.secondary : categorical(i)}
            radius={[4, 4, 0, 0]}
            maxBarSize={44}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Composition donut with center total. */
export function Donut({
  data,
  height = 240,
  centerLabel,
  centerValue,
  fmt,
}: {
  data: { label: string; value: number }[];
  height?: number;
  centerLabel?: string;
  centerValue?: string;
  fmt?: (v: number) => string;
}) {
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip content={<ChartTooltip fmt={fmt} />} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="62%"
            outerRadius="90%"
            paddingAngle={2}
            stroke="var(--color-paper)"
            strokeWidth={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={categorical(i)} />
            ))}
          </Pie>
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      {(centerLabel || centerValue) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-8 text-center">
          {centerValue && (
            <span className="font-display text-xl font-bold text-ink">{centerValue}</span>
          )}
          {centerLabel && <span className="max-w-[7rem] text-[11px] text-muted">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}

export { CATEGORICAL };
export { PeriodFilter, type Period } from "./period-filter";
