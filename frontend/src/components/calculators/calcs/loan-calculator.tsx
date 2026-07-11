"use client";

import { useState } from "react";
import { DonutChart } from "@/components/admin/ui/charts";
import { formatMoney, num } from "@/lib/invoice/money";
import { amortization, computeLoan } from "@/lib/calculators/loan";
import {
  Disclaimer,
  Field,
  Headline,
  InfoSection,
  MoneyInput,
  NumberInput,
  PresetButtons,
  ResultRow,
  ResultsPanel,
  SliderInput,
  TwoPane,
} from "@/components/calculators/ui";

const LOAN_PRESETS = [1_000_000, 2_000_000, 5_000_000, 10_000_000, 20_000_000, 50_000_000];

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
      <PresetButtons
        presets={LOAN_PRESETS}
        onSelect={(v) => setPrincipal(String(v))}
        active={num(principal)}
        prefix="₦"
      />
      <SliderInput
        label="Annual interest rate"
        value={num(rate)}
        onChange={(v) => setRate(String(v))}
        min={1}
        max={50}
        step={0.5}
        suffix="%"
      />
      <SliderInput
        label="Loan term"
        value={num(months)}
        onChange={(v) => setMonths(String(v))}
        min={1}
        max={120}
        step={1}
        suffix=" months"
      />
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
      <InfoSection
        references={[
          { label: "CBN — Monetary Policy Rate", url: "https://www.cbn.gov.ng/rates/mnymktind.asp" },
          { label: "Consumer credit regulations", url: "https://www.cbn.gov.ng/out/2010/publications/bsd/consumercredit.pdf" },
        ]}
      >
        <p>Nigerian lending rates are influenced by the CBN Monetary Policy Rate (MPR). Commercial loan rates typically range from 18–35% per annum. This calculator uses a reducing-balance (amortisation) method.</p>
        <p className="mt-2"><strong>Tip:</strong> Compare the total interest against the principal to understand the true cost of borrowing. Shorter terms mean higher monthly payments but significantly less total interest.</p>
      </InfoSection>
    </ResultsPanel>
  );

  return <TwoPane form={form} results={results} />;
}
