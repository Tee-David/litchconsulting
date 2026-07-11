"use client";

import { useState } from "react";
import { DonutChart } from "@/components/admin/ui/charts";
import { formatMoney, num } from "@/lib/invoice/money";
import { computeCit } from "@/lib/calculators/cit";
import {
  Disclaimer,
  Field,
  Headline,
  InfoSection,
  MoneyInput,
  PresetButtons,
  ResultRow,
  ResultsPanel,
  Toggle,
  TwoPane,
} from "@/components/calculators/ui";

const REVENUE_PRESETS = [10_000_000, 50_000_000, 100_000_000, 250_000_000, 500_000_000];

export function CitCalculator() {
  const [revenue, setRevenue] = useState("50000000");
  const [expenses, setExpenses] = useState("30000000");
  const [fixedAssets, setFixedAssets] = useState("");
  const [professional, setProfessional] = useState(false);

  const r = computeCit({
    revenue: num(revenue),
    expenses: num(expenses),
    fixedAssets: num(fixedAssets),
    professionalServices: professional,
  });
  const f = (n: number) => formatMoney(n);

  const form = (
    <>
      <Field label="Annual revenue / turnover">
        <MoneyInput value={revenue} onChange={setRevenue} />
      </Field>
      <PresetButtons presets={REVENUE_PRESETS} onSelect={(v) => setRevenue(String(v))} active={num(revenue)} prefix="₦" />
      <Field label="Total allowable expenses">
        <MoneyInput value={expenses} onChange={setExpenses} />
      </Field>
      <Field label="Total fixed assets" hint="small-company test requires ≤ ₦250M">
        <MoneyInput value={fixedAssets} onChange={setFixedAssets} />
      </Field>
      <div className="rounded-xl border border-hairline bg-surface/50 p-4">
        <Toggle
          checked={professional}
          onChange={setProfessional}
          label="Professional services firm (excluded from the small-company exemption)"
        />
      </div>
      <div className="rounded-xl border border-hairline bg-surface/50 p-4">
        <p className="text-xs font-medium text-ink">Company classification</p>
        <p className="mt-1 text-sm font-bold text-brand dark:text-highlight">{r.tier}</p>
        <p className="mt-0.5 text-xs text-muted">
          CIT rate: {r.citRate}% + Development Levy {r.devLevyRate}%
        </p>
      </div>
    </>
  );

  const results = (
    <ResultsPanel>
      <span className="mb-4 block text-sm font-semibold text-ink">Tax estimate</span>
      <Headline label="Total tax liability" value={f(r.totalTax)} />
      <DonutChart
        segments={[
          { label: "Net profit", value: Math.max(0, r.netProfit), color: "#0a196d" },
          { label: "CIT", value: r.cit, color: "#e0574a" },
          { label: "Dev. Levy", value: r.devLevy, color: "#8aa0f2" },
        ]}
        centerValue={`${r.effectiveRate.toFixed(1)}%`}
        centerLabel="effective rate"
      />
      <div className="mt-5">
        <ResultRow label="Revenue" value={f(r.revenue)} />
        <ResultRow label="Expenses" value={f(r.expenses)} />
        <ResultRow label="Assessable profit" value={f(r.assessableProfit)} />
        <ResultRow label={`CIT (${r.citRate}%)`} value={f(r.cit)} accent />
        <ResultRow label={`Development Levy (${r.devLevyRate}%)`} value={f(r.devLevy)} />
        <ResultRow label="Net profit after tax" value={f(r.netProfit)} strong />
      </div>
      <Disclaimer>
        Simplified estimate under the Nigeria Tax Act 2025 (effective January 2026). Does not
        account for capital allowances, loss carry-forward, the 15% effective-tax-rate top-up for
        very large groups, or industry-specific exemptions.
      </Disclaimer>
      <InfoSection
        references={[
          { label: "Nigeria Tax Act 2025 — EY highlights", url: "https://www.ey.com/en_gl/technical/tax-alerts/nigeria-tax-act-2025-has-been-signed-highlights" },
          { label: "PwC — The Nigerian Tax Reform Acts", url: "https://www.pwc.com/ng/en/publications/the-nigerian-tax-reform-acts.html" },
          { label: "PwC Tax Summaries — Nigeria (Corporate)", url: "https://taxsummaries.pwc.com/nigeria/corporate/taxes-on-corporate-income" },
        ]}
      >
        <p>
          Company Income Tax is now governed by the Nigeria Tax Act 2025, effective 1 January 2026.
          Companies are either <strong>small (fully exempt)</strong> or <strong>standard (fully
          taxable)</strong> — the old medium tier is gone.
        </p>
        <p className="mt-2">
          <strong>Small company (0%):</strong> gross turnover ≤ ₦100M <em>and</em> total fixed
          assets ≤ ₦250M. Businesses providing professional services are excluded regardless of
          size. Small companies are also exempt from the Development Levy.
        </p>
        <p className="mt-2">
          <strong>Standard rate (30%):</strong> all other companies, plus a 4% Development Levy on
          assessable profit — consolidating the former TET, IT, NASENI and Police Trust Fund
          levies. The Act provides for a future reduction to 25% by presidential order.
        </p>
      </InfoSection>
    </ResultsPanel>
  );

  return <TwoPane form={form} results={results} />;
}
