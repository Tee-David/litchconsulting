"use client";

import { useState } from "react";
import { DonutChart } from "@/components/admin/ui/charts";
import { formatMoney, num } from "@/lib/invoice/money";
import { computeSalary } from "@/lib/calculators/salary";
import {
  Disclaimer,
  Field,
  Headline,
  MoneyInput,
  ResultRow,
  ResultsPanel,
  Segmented,
  Toggle,
  TwoPane,
} from "@/components/calculators/ui";

export function SalaryCalculator() {
  const [period, setPeriod] = useState<"annual" | "monthly">("monthly");
  const [gross, setGross] = useState("500000");
  const [pension, setPension] = useState(true);
  const [nhf, setNhf] = useState(false);
  const [rent, setRent] = useState("");
  const [view, setView] = useState<"monthly" | "annual">("monthly");

  const grossAnnual = period === "annual" ? num(gross) : num(gross) * 12;
  const s = computeSalary({
    grossAnnual,
    includePension: pension,
    includeNhf: nhf,
    rentPaid: num(rent),
  });
  const d = view === "monthly" ? 12 : 1;
  const f = (n: number) => formatMoney(n / d);

  const form = (
    <>
      <Field label="How is your salary quoted?">
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { value: "monthly", label: "Monthly" },
            { value: "annual", label: "Annual" },
          ]}
        />
      </Field>
      <Field label={`Gross ${period} salary`}>
        <MoneyInput value={gross} onChange={setGross} />
      </Field>
      <div className="space-y-2.5 rounded-xl border border-hairline bg-surface/50 p-4">
        <Toggle checked={pension} onChange={setPension} label="Deduct pension (8%)" />
        <Toggle checked={nhf} onChange={setNhf} label="Deduct NHF (2.5%)" />
      </div>
      <Field label="Annual rent paid" hint="for rent relief">
        <MoneyInput value={rent} onChange={setRent} />
      </Field>
    </>
  );

  const results = (
    <ResultsPanel>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">Take-home pay</span>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "monthly", label: "Monthly" },
            { value: "annual", label: "Annual" },
          ]}
        />
      </div>
      <Headline label={`Net ${view} pay`} value={f(s.netAnnual)} />
      <DonutChart
        segments={[
          { label: "Net", value: Math.max(0, s.netAnnual), color: "#0a196d" },
          { label: "Tax", value: s.paye.annualTax, color: "#e0574a" },
          { label: "Pension", value: s.pension, color: "#4c6ef5" },
          { label: "NHF", value: s.nhf, color: "#8aa0f2" },
        ]}
        centerValue={`${Math.round((s.netAnnual / Math.max(1, grossAnnual)) * 100)}%`}
        centerLabel="of gross"
      />
      <div className="mt-5">
        <ResultRow label={`Gross (${view})`} value={f(grossAnnual)} />
        <ResultRow label="PAYE tax" value={f(s.paye.annualTax)} accent />
        <ResultRow label="Pension" value={f(s.pension)} />
        {s.nhf > 0 && <ResultRow label="NHF" value={f(s.nhf)} />}
        <ResultRow label={`Net take-home (${view})`} value={f(s.netAnnual)} strong />
      </div>
      <Disclaimer>Estimate under the 2026 PIT Guidelines. Bands applied progressively.</Disclaimer>
    </ResultsPanel>
  );

  return <TwoPane form={form} results={results} />;
}
