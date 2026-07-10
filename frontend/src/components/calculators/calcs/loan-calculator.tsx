"use client";

import { useState } from "react";
import { DonutChart } from "@/components/admin/ui/charts";
import { formatMoney, num } from "@/lib/invoice/money";
import { amortization, computeLoan } from "@/lib/calculators/loan";
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

export function LoanCalculator() {
  const [principal, setPrincipal] = useState("5000000");
  const [rate, setRate] = useState("24");
  const [months, setMonths] = useState("12");

  const input = { principal: num(principal), annualRatePct: num(rate), months: num(months) };
  const l = computeLoan(input);
  const rows = amortization(input, 6);
  const f = (n: number) => formatMoney(n);

  const form = (
    <>
      <Field label="Loan amount">
        <MoneyInput value={principal} onChange={setPrincipal} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Annual interest rate">
          <NumberInput value={rate} onChange={setRate} suffix="%" step="0.5" />
        </Field>
        <Field label="Term">
          <NumberInput value={months} onChange={setMonths} suffix="mo" />
        </Field>
      </div>
      <div className="overflow-hidden rounded-xl border border-hairline">
        <table className="w-full text-xs">
          <thead className="bg-surface text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Month</th>
              <th className="px-3 py-2 text-right font-medium">Interest</th>
              <th className="px-3 py-2 text-right font-medium">Principal</th>
              <th className="px-3 py-2 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((row) => (
              <tr key={row.month} className="border-t border-hairline">
                <td className="px-3 py-1.5 text-body">{row.month}</td>
                <td className="px-3 py-1.5 text-right text-body">{formatMoney(row.interest)}</td>
                <td className="px-3 py-1.5 text-right text-body">{formatMoney(row.principal)}</td>
                <td className="px-3 py-1.5 text-right text-ink">{formatMoney(row.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  const results = (
    <ResultsPanel>
      <span className="mb-4 block text-sm font-semibold text-ink">Repayment</span>
      <Headline label="Monthly payment" value={f(l.monthlyPayment)} />
      <DonutChart
        segments={[
          { label: "Principal", value: l.principal, color: "#0a196d" },
          { label: "Interest", value: Math.max(0, l.totalInterest), color: "#e0574a" },
        ]}
        centerValue={`${l.months}mo`}
        centerLabel="term"
      />
      <div className="mt-5">
        <ResultRow label="Monthly payment" value={f(l.monthlyPayment)} accent />
        <ResultRow label="Total interest" value={f(l.totalInterest)} />
        <ResultRow label="Total payable" value={f(l.totalPayable)} strong />
      </div>
      <Disclaimer>Assumes a fixed rate and equal monthly instalments (reducing balance).</Disclaimer>
    </ResultsPanel>
  );

  return <TwoPane form={form} results={results} />;
}
