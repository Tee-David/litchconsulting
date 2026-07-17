"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NPV, IRR } from "@formulajs/formulajs";
import Papa from "papaparse";
import {
  TrendingUp, Scale, Wallet, Percent, Gauge, Plus, Trash2, Upload, RotateCcw, LineChart, Calculator,
} from "lucide-react";
import { StatCard } from "@/components/admin/ui/stat-card";
import { ExportMenu, type ExportColumn } from "@/components/admin/ui/export-menu";
import { useToast } from "@/components/admin/ui/toaster";
import { formatMoney, num, CURRENCIES } from "@/lib/invoice/money";
import { cn } from "@/lib/utils";

/* ----------------------------- types & defaults ----------------------------- */
type OpexLine = { id: string; label: string; amount: number };
type Scenario = "worst" | "base" | "best";

type Inputs = {
  currency: string;
  months: number;
  startRevenue: number;
  growthPct: number;
  grossMarginPct: number;
  taxPct: number;
  startCash: number;
  opex: OpexLine[];
  discountPct: number;
  terminalPct: number;
  initialInvestment: number;
};

const DEFAULTS: Inputs = {
  currency: "NGN",
  months: 24,
  startRevenue: 2_500_000,
  growthPct: 6,
  grossMarginPct: 62,
  taxPct: 30,
  startCash: 5_000_000,
  opex: [
    { id: "sal", label: "Salaries", amount: 900_000 },
    { id: "rent", label: "Rent & office", amount: 250_000 },
    { id: "sw", label: "Software", amount: 120_000 },
    { id: "mkt", label: "Marketing", amount: 200_000 },
  ],
  discountPct: 20,
  terminalPct: 3,
  initialInvestment: 0,
};

const STORAGE_KEY = "litch:model:v1";
const uid = () => Math.random().toString(36).slice(2, 8);

/** Scenario tilts growth and margin around the base case. */
function tilt(inp: Inputs, s: Scenario) {
  if (s === "best") return { g: inp.growthPct * 1.3 + 1, m: Math.min(95, inp.grossMarginPct + 3) };
  if (s === "worst") return { g: inp.growthPct * 0.5 - 1, m: Math.max(0, inp.grossMarginPct - 4) };
  return { g: inp.growthPct, m: inp.grossMarginPct };
}

type Row = { m: number; label: string; revenue: number; cogs: number; gross: number; opex: number; ebit: number; tax: number; net: number; cash: number };

function project(inp: Inputs, s: Scenario): Row[] {
  const { g, m } = tilt(inp, s);
  const opexTotal = inp.opex.reduce((a, o) => a + num(o.amount), 0);
  const rows: Row[] = [];
  let revenue = num(inp.startRevenue);
  let cash = num(inp.startCash);
  const now = new Date();
  for (let i = 0; i < Math.max(1, inp.months); i++) {
    if (i > 0) revenue = revenue * (1 + g / 100);
    const cogs = revenue * (1 - m / 100);
    const gross = revenue - cogs;
    const ebit = gross - opexTotal;
    const tax = ebit > 0 ? ebit * (num(inp.taxPct) / 100) : 0;
    const net = ebit - tax;
    cash += net;
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    rows.push({ m: i + 1, label: d.toLocaleString("en", { month: "short", year: "2-digit" }), revenue, cogs, gross, opex: opexTotal, ebit, tax, net, cash });
  }
  return rows;
}

const field = "w-full rounded-lg border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand tabular-nums";
const lbl = "mb-1 block text-xs font-medium text-body";

export function ModelTool() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [inp, setInp] = useState<Inputs>(DEFAULTS);
  const [scenario, setScenario] = useState<Scenario>("base");
  const [tab, setTab] = useState<"forecast" | "valuation">("forecast");
  const [loaded, setLoaded] = useState(false);

  // Autosave to localStorage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setInp({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(inp));
  }, [inp, loaded]);

  const set = <K extends keyof Inputs>(k: K, v: Inputs[K]) => setInp((s) => ({ ...s, [k]: v }));
  const setNum = (k: keyof Inputs) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as never);
  const fmt = (n: number) => formatMoney(n, inp.currency);

  const rows = useMemo(() => project(inp, scenario), [inp, scenario]);
  const compare = useMemo(() => ({ worst: project(inp, "worst"), base: project(inp, "base"), best: project(inp, "best") }), [inp]);

  const k = useMemo(() => {
    const totalRev = rows.reduce((a, r) => a + r.revenue, 0);
    const totalNet = rows.reduce((a, r) => a + r.net, 0);
    const endingCash = rows.at(-1)?.cash ?? 0;
    const avgMargin = totalRev ? (rows.reduce((a, r) => a + r.gross, 0) / totalRev) * 100 : 0;
    const breakEven = rows.find((r) => r.net > 0)?.m ?? null;
    const cashOut = rows.find((r) => r.cash < 0)?.m ?? null;
    return { totalRev, totalNet, endingCash, avgMargin, breakEven, cashOut };
  }, [rows]);

  /* ---- Valuation (annual FCF from the model) ---- */
  const val = useMemo(() => {
    const years = Math.max(1, Math.ceil(inp.months / 12));
    const fcf: number[] = [];
    for (let y = 0; y < years; y++) {
      const slice = rows.slice(y * 12, y * 12 + 12);
      fcf.push(slice.reduce((a, r) => a + r.net, 0));
    }
    const rate = num(inp.discountPct) / 100;
    const tg = num(inp.terminalPct) / 100;
    let pvExplicit = 0;
    try {
      pvExplicit = (NPV as (r: number, ...v: number[]) => number)(rate, ...fcf);
    } catch {
      pvExplicit = 0;
    }
    const lastFcf = fcf.at(-1) ?? 0;
    const terminal = rate > tg ? (lastFcf * (1 + tg)) / (rate - tg) : 0;
    const pvTerminal = terminal / Math.pow(1 + rate, years);
    const enterprise = pvExplicit + pvTerminal;
    let irr: number | null = null;
    if (num(inp.initialInvestment) > 0) {
      try {
        irr = (IRR as (v: number[], g?: number) => number)([-num(inp.initialInvestment), ...fcf]);
      } catch {
        irr = null;
      }
    }
    return { years, fcf, pvExplicit, pvTerminal, enterprise, irr };
  }, [rows, inp]);

  /* ---- CSV import: seed starting revenue + growth from a client's history ---- */
  function importCsv(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const nums: number[] = [];
        for (const r of res.data) {
          const firstNumeric = Object.values(r)
            .map((v) => Number(String(v).replace(/[₦$,\s]/g, "")))
            .find((n) => Number.isFinite(n) && n !== 0);
          if (firstNumeric != null) nums.push(firstNumeric);
        }
        if (nums.length < 2) {
          toast.error("Couldn't find a revenue column with at least two values.");
          return;
        }
        const start = nums.at(-1)!;
        let growth = 0;
        for (let i = 1; i < nums.length; i++) if (nums[i - 1] > 0) growth += (nums[i] - nums[i - 1]) / nums[i - 1];
        growth = (growth / (nums.length - 1)) * 100;
        setInp((s) => ({ ...s, startRevenue: Math.round(start), growthPct: Math.round(growth * 10) / 10 }));
        toast.success(`Imported ${nums.length} periods — starting revenue & growth set.`);
      },
      error: () => toast.error("Could not read that CSV."),
    });
  }

  const exportCols: ExportColumn<Row>[] = [
    { header: "Month", accessor: (r) => r.label },
    { header: "Revenue", accessor: (r) => Math.round(r.revenue) },
    { header: "COGS", accessor: (r) => Math.round(r.cogs) },
    { header: "Gross profit", accessor: (r) => Math.round(r.gross) },
    { header: "Operating expenses", accessor: (r) => Math.round(r.opex) },
    { header: "EBIT", accessor: (r) => Math.round(r.ebit) },
    { header: "Tax", accessor: (r) => Math.round(r.tax) },
    { header: "Net profit", accessor: (r) => Math.round(r.net) },
    { header: "Cash balance", accessor: (r) => Math.round(r.cash) },
  ];

  const maxRev = Math.max(1, ...rows.map((r) => Math.abs(r.revenue)));
  const cashMin = Math.min(0, ...rows.map((r) => r.cash));
  const cashMax = Math.max(1, ...rows.map((r) => r.cash));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-card border border-hairline bg-paper p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-base font-bold text-ink">Financial model &amp; forecast</h2>
          <p className="text-sm text-body">Driver-based projections, scenarios and a DCF valuation — export a client-ready pack.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ""; }} />
          <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface">
            <Upload className="size-4" /> Import CSV
          </button>
          <button onClick={() => { setInp(DEFAULTS); toast.success("Reset to defaults."); }} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm font-medium text-body transition-colors hover:bg-surface hover:text-ink">
            <RotateCcw className="size-4" /> Reset
          </button>
          <ExportMenu rows={rows} columns={exportCols} filename="financial-model" title={`Financial model — ${scenario} case (${inp.currency})`} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Assumptions */}
        <div className="space-y-4 rounded-card border border-hairline bg-paper p-5">
          <h3 className="font-display text-sm font-bold text-ink">Assumptions</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Currency</label>
              <select value={inp.currency} onChange={(e) => set("currency", e.target.value)} className={field}>
                {CURRENCIES.map((c) => (<option key={c.code} value={c.code}>{c.symbol} {c.code}</option>))}
              </select>
            </div>
            <div>
              <label className={lbl}>Horizon (months)</label>
              <select value={inp.months} onChange={(e) => set("months", Number(e.target.value))} className={field}>
                {[12, 18, 24, 36, 48, 60].map((n) => (<option key={n} value={n}>{n}</option>))}
              </select>
            </div>
            <div>
              <label className={lbl}>Starting revenue / mo</label>
              <input type="number" value={inp.startRevenue} onChange={setNum("startRevenue")} className={field} />
            </div>
            <div>
              <label className={lbl}>Revenue growth / mo (%)</label>
              <input type="number" step="0.1" value={inp.growthPct} onChange={setNum("growthPct")} className={field} />
            </div>
            <div>
              <label className={lbl}>Gross margin (%)</label>
              <input type="number" step="0.1" value={inp.grossMarginPct} onChange={setNum("grossMarginPct")} className={field} />
            </div>
            <div>
              <label className={lbl}>Tax rate (%)</label>
              <input type="number" step="0.1" value={inp.taxPct} onChange={setNum("taxPct")} className={field} />
            </div>
            <div className="col-span-2">
              <label className={lbl}>Starting cash</label>
              <input type="number" value={inp.startCash} onChange={setNum("startCash")} className={field} />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className={lbl + " mb-0"}>Monthly operating expenses</label>
              <button onClick={() => set("opex", [...inp.opex, { id: uid(), label: "New cost", amount: 0 }])} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                <Plus className="size-3.5" /> Add
              </button>
            </div>
            <div className="space-y-2">
              {inp.opex.map((o) => (
                <div key={o.id} className="flex items-center gap-2">
                  <input value={o.label} onChange={(e) => set("opex", inp.opex.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)))} className={cn(field, "flex-1")} />
                  <input type="number" value={o.amount} onChange={(e) => set("opex", inp.opex.map((x) => (x.id === o.id ? { ...x, amount: Number(e.target.value) } : x)))} className={cn(field, "w-28")} />
                  <button onClick={() => set("opex", inp.opex.filter((x) => x.id !== o.id))} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger" aria-label="Remove">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Scenario */}
          <div>
            <label className={lbl}>Scenario</label>
            <div className="flex gap-1 rounded-lg border border-hairline bg-paper p-1">
              {(["worst", "base", "best"] as Scenario[]).map((s) => (
                <button key={s} onClick={() => setScenario(s)} className={cn("flex-1 rounded-md px-2 py-1.5 text-xs font-semibold capitalize transition-colors", scenario === s ? "bg-brand text-white dark:bg-highlight dark:text-ink" : "text-body hover:text-ink")}>
                  {s}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-muted">Best/worst tilt growth &amp; margin around your base case.</p>
          </div>
        </div>

        {/* Output */}
        <div className="space-y-5">
          <div className="flex gap-1 border-b border-hairline">
            <button onClick={() => setTab("forecast")} className={cn("inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium", tab === "forecast" ? "border-b-2 border-brand text-brand" : "text-body hover:text-ink")}>
              <LineChart className="size-4" /> Forecast
            </button>
            <button onClick={() => setTab("valuation")} className={cn("inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium", tab === "valuation" ? "border-b-2 border-brand text-brand" : "text-body hover:text-ink")}>
              <Calculator className="size-4" /> Valuation
            </button>
          </div>

          {tab === "forecast" ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Total revenue" value={fmt(k.totalRev)} icon={TrendingUp} hint={`${inp.months} mo`} />
                <StatCard label="Net profit" value={fmt(k.totalNet)} icon={Scale} />
                <StatCard label="Ending cash" value={fmt(k.endingCash)} icon={Wallet} hint={k.cashOut ? `Cash-out mo ${k.cashOut}` : "Stays positive"} />
                <StatCard label="Avg gross margin" value={`${k.avgMargin.toFixed(0)}%`} icon={Percent} hint={k.breakEven ? `Profit from mo ${k.breakEven}` : undefined} />
              </div>

              {/* Revenue bars + cash line */}
              <div className="rounded-card border border-hairline bg-paper p-5">
                <h3 className="mb-4 flex items-center gap-2 font-display text-sm font-bold text-ink"><Gauge className="size-4 text-brand" /> Revenue &amp; cash — {scenario} case</h3>
                <div className="flex items-end gap-1" style={{ height: 160 }}>
                  {rows.map((r, i) => (
                    <div key={i} className="group relative flex-1" title={`${r.label}: ${fmt(r.revenue)}`}>
                      <div className="mx-auto w-full max-w-4 rounded-t bg-brand/85 dark:bg-highlight" style={{ height: `${(r.revenue / maxRev) * 150}px` }} />
                    </div>
                  ))}
                </div>
                {/* cash line */}
                <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-2 h-16 w-full">
                  <polyline
                    fill="none"
                    stroke="var(--color-brand)"
                    strokeWidth="0.6"
                    className="dark:[stroke:var(--color-highlight)]"
                    points={rows.map((r, i) => `${(i / Math.max(1, rows.length - 1)) * 100},${30 - ((r.cash - cashMin) / (cashMax - cashMin || 1)) * 28}`).join(" ")}
                  />
                </svg>
                <div className="flex items-center justify-between text-[11px] text-muted"><span>{rows[0]?.label}</span><span>Cash balance</span><span>{rows.at(-1)?.label}</span></div>
              </div>

              {/* Scenario comparison */}
              <div className="grid grid-cols-3 gap-3">
                {(["worst", "base", "best"] as Scenario[]).map((s) => {
                  const rr = compare[s];
                  const net = rr.reduce((a, r) => a + r.net, 0);
                  const end = rr.at(-1)?.cash ?? 0;
                  return (
                    <button key={s} onClick={() => setScenario(s)} className={cn("rounded-card border p-4 text-left transition-colors", scenario === s ? "border-brand bg-brand-tint/40" : "border-hairline bg-paper hover:bg-surface")}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{s} case</p>
                      <p className="mt-1 font-display text-sm font-bold text-ink">{fmt(net)}</p>
                      <p className="text-[11px] text-body">net · ending cash {fmt(end)}</p>
                    </button>
                  );
                })}
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-card border border-hairline bg-paper">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-muted">
                      <th className="px-4 py-3 font-semibold">Month</th>
                      <th className="px-4 py-3 text-right font-semibold">Revenue</th>
                      <th className="px-4 py-3 text-right font-semibold">Gross</th>
                      <th className="px-4 py-3 text-right font-semibold">EBIT</th>
                      <th className="px-4 py-3 text-right font-semibold">Net</th>
                      <th className="px-4 py-3 text-right font-semibold">Cash</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {rows.map((r) => (
                      <tr key={r.m} className="tabular-nums transition-colors hover:bg-surface/50">
                        <td className="px-4 py-2.5 text-body">{r.label}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-ink">{fmt(r.revenue)}</td>
                        <td className="px-4 py-2.5 text-right text-body">{fmt(r.gross)}</td>
                        <td className="px-4 py-2.5 text-right text-body">{fmt(r.ebit)}</td>
                        <td className={cn("px-4 py-2.5 text-right font-medium", r.net >= 0 ? "text-success" : "text-danger")}>{fmt(r.net)}</td>
                        <td className={cn("px-4 py-2.5 text-right", r.cash >= 0 ? "text-ink" : "text-danger")}>{fmt(r.cash)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            /* ---------------- Valuation ---------------- */
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <label className={lbl}>Discount rate / WACC (%)</label>
                  <input type="number" step="0.1" value={inp.discountPct} onChange={setNum("discountPct")} className={field} />
                </div>
                <div>
                  <label className={lbl}>Terminal growth (%)</label>
                  <input type="number" step="0.1" value={inp.terminalPct} onChange={setNum("terminalPct")} className={field} />
                </div>
                <div>
                  <label className={lbl}>Initial investment (for IRR)</label>
                  <input type="number" value={inp.initialInvestment} onChange={setNum("initialInvestment")} className={field} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Enterprise value" value={fmt(val.enterprise)} icon={Scale} hint="DCF, base case" />
                <StatCard label="PV of cash flows" value={fmt(val.pvExplicit)} icon={Wallet} />
                <StatCard label="PV of terminal" value={fmt(val.pvTerminal)} icon={TrendingUp} />
                <StatCard label="IRR" value={val.irr == null ? "—" : `${(val.irr * 100).toFixed(1)}%`} icon={Percent} hint={num(inp.initialInvestment) > 0 ? undefined : "Add investment"} />
              </div>

              <div className="overflow-x-auto rounded-card border border-hairline bg-paper">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-muted">
                      <th className="px-4 py-3 font-semibold">Year</th>
                      <th className="px-4 py-3 text-right font-semibold">Free cash flow</th>
                      <th className="px-4 py-3 text-right font-semibold">Discount factor</th>
                      <th className="px-4 py-3 text-right font-semibold">Present value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {val.fcf.map((f, i) => {
                      const df = 1 / Math.pow(1 + num(inp.discountPct) / 100, i + 1);
                      return (
                        <tr key={i} className="tabular-nums transition-colors hover:bg-surface/50">
                          <td className="px-4 py-2.5 text-body">Year {i + 1}</td>
                          <td className="px-4 py-2.5 text-right font-medium text-ink">{fmt(f)}</td>
                          <td className="px-4 py-2.5 text-right text-body">{df.toFixed(3)}</td>
                          <td className="px-4 py-2.5 text-right text-body">{fmt(f * df)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted">
                Free cash flow is approximated from the model&rsquo;s annual net profit. Terminal value uses the Gordon growth method; enterprise value discounts both back at your WACC. IRR uses Excel-compatible functions (formula.js).
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
