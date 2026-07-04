"use client";

import { useMemo, useState } from "react";
import { Layers, Coins, Boxes, Gauge } from "lucide-react";
import { StatCard } from "@/components/admin/ui/stat-card";
import { ExportMenu, type ExportColumn } from "@/components/admin/ui/export-menu";
import { cn } from "@/lib/utils";

/* Curated Litch model portfolios — risk-graded asset allocations (illustrative). */
const MODELS = [
  { id: "income", name: "Litch Income", desc: "Capital preservation and income — weighted to bonds and cash.", tilt: 0.85, ocf: 0 },
  { id: "balanced", name: "Litch Balanced", desc: "A blend of growth and defensive assets for steady total return.", tilt: 1, ocf: 0.02 },
  { id: "growth", name: "Litch Growth", desc: "Long-horizon capital growth with a strong equity tilt.", tilt: 1.1, ocf: 0.04 },
] as const;

const LEVELS = [0, 20, 40, 60, 80, 100];

const ASSETS = [
  { key: "equity", label: "Equity", color: "#f5a524" },
  { key: "bonds", label: "Bonds", color: "#2540c4" },
  { key: "cash", label: "Cash", color: "#12b3a6" },
] as const;

const GEO = [
  { key: "na", label: "North America", color: "#0a196d", w: 0.42 },
  { key: "europe", label: "Europe", color: "#3b2f8f", w: 0.2 },
  { key: "pacific", label: "Pacific", color: "#6c5ce7", w: 0.12 },
  { key: "em", label: "Emerging Markets", color: "#a99bf2", w: 0.2 },
  { key: "other", label: "Other", color: "#cfc7f7", w: 0.06 },
] as const;

const BOND_FUNDS = [
  { name: "Global Short-Dated Bond Index", w: 0.4 },
  { name: "Sterling Inflation-Linked Gilt Index", w: 0.35 },
  { name: "Global Bond Index (GBP Hedged)", w: 0.25 },
];
const EQUITY_FUNDS = [
  { name: "FTSE Global All Cap Index", w: 0.4 },
  { name: "Global Targeted Value", w: 0.35 },
  { name: "Emerging Markets Stock Index", w: 0.25 },
];
const CASH_FUNDS = [{ name: "Cash & money market", w: 1 }];

type Tilt = (typeof MODELS)[number]["tilt"];

function alloc(level: number, tilt: Tilt) {
  const equity = Math.max(0, Math.min(100, Math.round(level * tilt)));
  const bonds = Math.round((100 - equity) * 0.8);
  const cash = 100 - equity - bonds;
  return { equity, bonds, cash };
}

function info(level: number, ocfAdj: number) {
  return {
    ocf: (0.12 + (level / 100) * 0.1 + ocfAdj).toFixed(2),
    txn: (0.05 + (level / 100) * 0.03).toFixed(2),
    funds: 8,
    securities: Math.round(8000 + level * 240).toLocaleString(),
    benchmark: `RPI ${(level / 100) * 4 - 1 >= 0 ? "+" : ""}${((level / 100) * 4 - 1).toFixed(1)}%`,
  };
}

/** Horizontal stacked allocation bar. */
function StackBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  return (
    <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-surface">
      {parts.map((p) => (
        <div key={p.label} style={{ width: `${p.value}%`, background: p.color }} title={`${p.label} ${p.value}%`} />
      ))}
    </div>
  );
}

export function ModelPortfolios() {
  const [modelId, setModelId] = useState<string>("balanced");
  const [level, setLevel] = useState<number>(60);
  const model = MODELS.find((m) => m.id === modelId) ?? MODELS[1];

  const a = useMemo(() => alloc(level, model.tilt), [level, model.tilt]);
  const meta = useMemo(() => info(level, model.ocf), [level, model.ocf]);

  const geoParts = GEO.map((g) => ({ label: g.label, value: Math.round(a.equity * g.w), color: g.color }));

  const funds = useMemo(() => {
    const mk = (list: { name: string; w: number }[], classPct: number, klass: string, color: string) =>
      list.map((f) => ({ klass, color, name: f.name, weight: Math.round(classPct * f.w * 10) / 10 }));
    return [
      ...mk(EQUITY_FUNDS, a.equity, "Equity", "#f5a524"),
      ...mk(BOND_FUNDS, a.bonds, "Bonds", "#2540c4"),
      ...mk(CASH_FUNDS, a.cash, "Cash", "#12b3a6"),
    ];
  }, [a]);

  const exportCols: ExportColumn<(typeof funds)[number]>[] = [
    { header: "Asset class", accessor: (f) => f.klass },
    { header: "Fund", accessor: (f) => f.name },
    { header: `Weight % (risk ${level})`, accessor: (f) => f.weight },
  ];

  return (
    <div className="space-y-6">
      {/* Model selector */}
      <div className="flex flex-col gap-3 rounded-card border border-hairline bg-paper p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <select value={modelId} onChange={(e) => setModelId(e.target.value)} className="h-10 rounded-lg border border-hairline bg-paper px-3 text-sm font-semibold text-ink outline-none focus:border-brand">
            {MODELS.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
          </select>
          <p className="hidden max-w-md text-sm text-body sm:block">{model.desc}</p>
        </div>
        <ExportMenu rows={funds} columns={exportCols} filename={`${model.id}-model-portfolio`} title={`${model.name} — risk ${level}`} />
      </div>

      {/* Risk-level selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Growth assets</span>
        <div className="flex gap-1 rounded-lg border border-hairline bg-paper p-1">
          {LEVELS.map((l) => (
            <button key={l} onClick={() => setLevel(l)} className={cn("rounded-md px-3 py-1.5 text-sm font-semibold tabular-nums transition-colors", level === l ? "bg-brand text-white dark:bg-highlight dark:text-ink" : "text-body hover:text-ink")}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* General info cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="OCF (weighted)" value={`${meta.ocf}%`} icon={Coins} />
        <StatCard label="Transaction cost" value={`${meta.txn}%`} icon={Gauge} />
        <StatCard label="Funds / securities" value={`${meta.funds}`} icon={Boxes} hint={`${meta.securities} securities`} />
        <StatCard label="Benchmark" value={meta.benchmark} icon={Layers} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Asset allocation */}
        <div className="rounded-card border border-hairline bg-paper p-5">
          <h3 className="mb-4 font-display text-sm font-bold text-ink">Asset allocation</h3>
          <StackBar parts={ASSETS.map((x) => ({ label: x.label, value: a[x.key], color: x.color }))} />
          <div className="mt-4 space-y-2">
            {ASSETS.map((x) => (
              <div key={x.key} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-body"><span className="size-2.5 rounded-full" style={{ background: x.color }} /> {x.label}</span>
                <span className="font-semibold tabular-nums text-ink">{a[x.key]}%</span>
              </div>
            ))}
          </div>

          {/* Across risk levels */}
          <p className="mb-2 mt-6 text-xs font-medium text-muted">Across growth-asset levels</p>
          <div className="flex items-end gap-1.5" style={{ height: 90 }}>
            {LEVELS.map((l) => {
              const la = alloc(l, model.tilt);
              return (
                <button key={l} onClick={() => setLevel(l)} className="group flex flex-1 flex-col items-center gap-1">
                  <div className={cn("flex w-full max-w-8 flex-col overflow-hidden rounded", level === l && "ring-2 ring-brand")} style={{ height: 70 }}>
                    {ASSETS.map((x) => (<div key={x.key} style={{ height: `${la[x.key]}%`, background: x.color }} />))}
                  </div>
                  <span className="text-[10px] text-muted">{l}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Geographical spread */}
        <div className="rounded-card border border-hairline bg-paper p-5">
          <h3 className="mb-4 font-display text-sm font-bold text-ink">Geographical spread</h3>
          <StackBar parts={geoParts.length ? geoParts : [{ label: "Cash", value: 100, color: "#12b3a6" }]} />
          <div className="mt-4 space-y-2">
            {GEO.map((g, i) => (
              <div key={g.key} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-body"><span className="size-2.5 rounded-full" style={{ background: g.color }} /> {g.label}</span>
                <span className="font-semibold tabular-nums text-ink">{geoParts[i].value}%</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-muted">Regional weights apply to the {a.equity}% equity allocation; defensive assets are held domestically.</p>
        </div>
      </div>

      {/* Funds table */}
      <div className="overflow-hidden rounded-card border border-hairline bg-paper">
        <div className="border-b border-hairline px-5 py-4">
          <h3 className="font-display text-sm font-bold text-ink">Underlying funds — {model.name} · risk {level}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-semibold">Fund</th>
                <th className="px-5 py-3 font-semibold">Asset class</th>
                <th className="px-5 py-3 text-right font-semibold">Weight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {funds.map((f, i) => (
                <tr key={i} className="transition-colors hover:bg-surface/50">
                  <td className="px-5 py-3 font-medium text-ink">{f.name}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1.5 text-body"><span className="size-2.5 rounded-full" style={{ background: f.color }} /> {f.klass}</span>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums text-ink">{f.weight}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
