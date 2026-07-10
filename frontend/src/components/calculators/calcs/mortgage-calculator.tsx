"use client";

import { useState } from "react";
import { DonutChart } from "@/components/admin/ui/charts";
import { formatMoney, num } from "@/lib/invoice/money";
import { computeMortgage } from "@/lib/calculators/mortgage";
import {
  Disclaimer,
  Field,
  Headline,
  MoneyInput,
  NumberInput,
  ResultRow,
  ResultsPanel,
  TwoPane,
} from "@/components/calculators/ui";

export function MortgageCalculator() {
  const [price, setPrice] = useState("60000000");
  const [down, setDown] = useState("20");
  const [rate, setRate] = useState("18");
  const [years, setYears] = useState("20");

  const m = computeMortgage({
    price: num(price),
    downPaymentPct: num(down),
    annualRatePct: num(rate),
    years: num(years),
  });
  const f = (n: number) => formatMoney(n);

  const form = (
    <>
      <Field label="Property price">
        <MoneyInput value={price} onChange={setPrice} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Down payment">
          <NumberInput value={down} onChange={setDown} suffix="%" step="1" />
        </Field>
        <Field label="Interest rate">
          <NumberInput value={rate} onChange={setRate} suffix="%" step="0.5" />
        </Field>
      </div>
      <Field label="Term">
        <NumberInput value={years} onChange={setYears} suffix="yrs" />
      </Field>
      <div className="rounded-xl border border-hairline bg-surface/50 p-4 text-sm">
        <div className="flex justify-between text-body">
          <span>Down payment</span>
          <span className="tabular-nums text-ink">{f(m.downPayment)}</span>
        </div>
        <div className="mt-1.5 flex justify-between text-body">
          <span>Loan amount</span>
          <span className="tabular-nums text-ink">{f(m.loanAmount)}</span>
        </div>
      </div>
    </>
  );

  const results = (
    <ResultsPanel>
      <span className="mb-4 block text-sm font-semibold text-ink">Mortgage</span>
      <Headline label="Monthly repayment" value={f(m.monthlyPayment)} />
      <DonutChart
        segments={[
          { label: "Loan", value: m.loanAmount, color: "#0a196d" },
          { label: "Interest", value: Math.max(0, m.totalInterest), color: "#e0574a" },
        ]}
        centerValue={`${Math.round(m.months / 12)}yr`}
        centerLabel="term"
      />
      <div className="mt-5">
        <ResultRow label="Monthly repayment" value={f(m.monthlyPayment)} accent />
        <ResultRow label="Total interest" value={f(m.totalInterest)} />
        <ResultRow label="Total of payments" value={f(m.totalPayable)} />
        <ResultRow label="Total cost (with deposit)" value={f(m.totalPayable + m.downPayment)} strong />
      </div>
      <Disclaimer>Indicative only. Nigerian mortgage rates and NHF-backed terms vary by lender.</Disclaimer>
    </ResultsPanel>
  );

  return <TwoPane form={form} results={results} />;
}
