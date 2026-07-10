"use client";

import { useState } from "react";
import { formatMoney, num } from "@/lib/invoice/money";
import { netToGross } from "@/lib/calculators/reverse-salary";
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

export function ReverseSalaryCalculator() {
  const [period, setPeriod] = useState<"annual" | "monthly">("monthly");
  const [net, setNet] = useState("400000");
  const [pension, setPension] = useState(true);
  const [nhf, setNhf] = useState(false);
  const [view, setView] = useState<"monthly" | "annual">("monthly");

  const targetNetAnnual = period === "annual" ? num(net) : num(net) * 12;
  const res = netToGross(targetNetAnnual, { includePension: pension, includeNhf: nhf });
  const s = res.salary;
  const d = view === "monthly" ? 12 : 1;
  const f = (n: number) => formatMoney(n / d);

  const form = (
    <>
      <Field label="Desired take-home is quoted…">
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { value: "monthly", label: "Monthly" },
            { value: "annual", label: "Annual" },
          ]}
        />
      </Field>
      <Field label={`Target net ${period} pay`} hint="what you want to receive">
        <MoneyInput value={net} onChange={setNet} />
      </Field>
      <div className="space-y-2.5 rounded-xl border border-hairline bg-surface/50 p-4">
        <Toggle checked={pension} onChange={setPension} label="Include pension (8%)" />
        <Toggle checked={nhf} onChange={setNhf} label="Include NHF (2.5%)" />
      </div>
    </>
  );

  const results = (
    <ResultsPanel>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">Required gross</span>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "monthly", label: "Monthly" },
            { value: "annual", label: "Annual" },
          ]}
        />
      </div>
      <Headline label={`Gross ${view} salary needed`} value={f(res.requiredGrossAnnual)} />
      <div className="mt-2">
        <ResultRow label={`Target net (${view})`} value={f(targetNetAnnual)} />
        <ResultRow label={`Required gross (${view})`} value={f(res.requiredGrossAnnual)} accent />
        <ResultRow label="PAYE tax" value={f(s.paye.annualTax)} />
        <ResultRow label="Pension + NHF" value={f(s.pension + s.nhf)} />
        <ResultRow label={`Net take-home (${view})`} value={f(s.netAnnual)} strong />
      </div>
      <Disclaimer>
        Solved by iterating the 2026 PAYE bands until the take-home matches your target.
      </Disclaimer>
    </ResultsPanel>
  );

  return <TwoPane form={form} results={results} />;
}
