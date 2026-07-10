"use client";

import { useState } from "react";
import { DonutChart } from "@/components/admin/ui/charts";
import { formatMoney, num } from "@/lib/invoice/money";
import { computePension } from "@/lib/calculators/pension";
import {
  Disclaimer,
  Field,
  Headline,
  MoneyInput,
  NumberInput,
  ResultRow,
  ResultsPanel,
  Segmented,
  TwoPane,
} from "@/components/calculators/ui";

export function PensionCalculator() {
  const [emolument, setEmolument] = useState("400000");
  const [mode, setMode] = useState<"split" | "employer-only">("split");
  const [balance, setBalance] = useState("");
  const [years, setYears] = useState("");
  const [ret, setRet] = useState("10");

  const p = computePension({
    monthlyEmolument: num(emolument),
    mode,
    currentBalance: num(balance),
    yearsToRetirement: num(years),
    annualReturnPct: num(ret),
  });
  const f = (n: number) => formatMoney(n);

  const form = (
    <>
      <Field label="Monthly pensionable emolument" hint="basic + housing + transport">
        <MoneyInput value={emolument} onChange={setEmolument} />
      </Field>
      <Field label="Contribution structure">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "split", label: "8% + 10%" },
            { value: "employer-only", label: "Employer 20%" },
          ]}
        />
      </Field>
      <div className="rounded-xl border border-hairline bg-surface/50 p-4">
        <p className="mb-3 text-xs font-medium text-body">Projection (optional)</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Current RSA balance">
            <MoneyInput value={balance} onChange={setBalance} />
          </Field>
          <Field label="Years to retirement">
            <NumberInput value={years} onChange={setYears} placeholder="e.g. 25" />
          </Field>
          <Field label="Expected return">
            <NumberInput value={ret} onChange={setRet} suffix="%" step="0.5" />
          </Field>
        </div>
      </div>
    </>
  );

  const results = (
    <ResultsPanel>
      <span className="mb-4 block text-sm font-semibold text-ink">Monthly contribution</span>
      <Headline label="Total monthly contribution" value={f(p.totalMonthly)} />
      <DonutChart
        segments={[
          { label: "Employee", value: p.employeeMonthly, color: "#0a196d" },
          { label: "Employer", value: p.employerMonthly, color: "#4c6ef5" },
        ]}
        centerValue={`${Math.round((p.employeeRate + p.employerRate) * 100)}%`}
        centerLabel="of emolument"
      />
      <div className="mt-5">
        <ResultRow label={`Employee (${Math.round(p.employeeRate * 100)}%)`} value={f(p.employeeMonthly)} />
        <ResultRow label={`Employer (${Math.round(p.employerRate * 100)}%)`} value={f(p.employerMonthly)} />
        <ResultRow label="Total per year" value={f(p.totalAnnual)} accent />
        {p.projectedBalance != null && (
          <ResultRow label="Projected balance at retirement" value={f(p.projectedBalance)} strong />
        )}
      </div>
      <Disclaimer>Contributory Pension Scheme, Pension Reform Act 2014. Projection assumes level contributions.</Disclaimer>
    </ResultsPanel>
  );

  return <TwoPane form={form} results={results} />;
}
