"use client";

import { useState } from "react";
import { formatMoney, num } from "@/lib/invoice/money";
import { computeCompound } from "@/lib/calculators/compound-interest";
import {
  Disclaimer,
  Field,
  Headline,
  InfoSection,
  MoneyInput,
  PresetButtons,
  ResultRow,
  ResultsPanel,
  Segmented,
  SliderInput,
  TwoPane,
} from "@/components/calculators/ui";

const PRINCIPAL_PRESETS = [500_000, 1_000_000, 5_000_000, 10_000_000, 50_000_000];

type Freq = "1" | "2" | "4" | "12" | "365";

export function CompoundInterestCalculator() {
  const [principal, setPrincipal] = useState("1000000");
  const [rate, setRate] = useState("15");
  const [years, setYears] = useState(5);
  const [monthly, setMonthly] = useState("50000");
  const [freq, setFreq] = useState<Freq>("12");

  const r = computeCompound({
    principal: num(principal),
    ratePct: num(rate),
    years,
    monthlyAdd: num(monthly),
    compounds: Number(freq) as 1 | 2 | 4 | 12 | 365,
  });
  const f = (n: number) => formatMoney(n);

  const form = (
    <>
      <Field label="Initial investment">
        <MoneyInput value={principal} onChange={setPrincipal} />
      </Field>
      <PresetButtons presets={PRINCIPAL_PRESETS} onSelect={(v) => setPrincipal(String(v))} active={num(principal)} prefix="₦" />
      <Field label="Monthly contribution">
        <MoneyInput value={monthly} onChange={setMonthly} />
      </Field>
      <SliderInput
        label="Annual return rate"
        value={num(rate)}
        onChange={(v) => setRate(String(v))}
        min={1}
        max={40}
        step={0.5}
        suffix="%"
      />
      <SliderInput
        label="Investment period"
        value={years}
        onChange={setYears}
        min={1}
        max={30}
        step={1}
        suffix=" years"
      />
      <Field label="Compounding frequency">
        <Segmented
          value={freq}
          onChange={setFreq}
          options={[
            { value: "1", label: "Yearly" },
            { value: "4", label: "Quarterly" },
            { value: "12", label: "Monthly" },
            { value: "365", label: "Daily" },
          ]}
        />
      </Field>
    </>
  );

  const results = (
    <ResultsPanel>
      <span className="mb-4 block text-sm font-semibold text-ink">Projection</span>
      <Headline label={`Future value (${years} years)`} value={f(r.futureValue)} />
      <div className="mt-2">
        <ResultRow label="Initial investment" value={f(r.principal)} />
        <ResultRow label="Total contributions" value={f(r.totalContributions)} />
        <ResultRow label="Total interest earned" value={f(r.totalInterest)} accent />
        <ResultRow label="Future value" value={f(r.futureValue)} strong />
      </div>
      {r.yearByYear.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-xl border border-hairline">
          <table className="w-full text-xs">
            <thead className="bg-surface text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Year</th>
                <th className="px-3 py-2 text-right font-medium">Balance</th>
                <th className="px-3 py-2 text-right font-medium">Interest</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {r.yearByYear.map((row) => (
                <tr key={row.year} className="border-t border-hairline">
                  <td className="px-3 py-1.5 text-body">{row.year}</td>
                  <td className="px-3 py-1.5 text-right text-ink">{f(row.balance)}</td>
                  <td className="px-3 py-1.5 text-right text-body">{f(row.interest)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Disclaimer>This is a projection based on constant rates and contributions. Actual returns may vary.</Disclaimer>
      <InfoSection>
        <p>Compound interest grows your money exponentially — you earn interest on your interest. The more frequently interest compounds, the faster your money grows.</p>
        <p className="mt-2"><strong>Tip:</strong> Even small monthly contributions make a huge difference over time. Starting early is the most powerful factor in wealth building.</p>
        <p className="mt-2"><strong>Nigerian context:</strong> Fixed deposit rates at commercial banks range from 10–18% p.a. Money market funds and Treasury bills offer competitive short-term returns.</p>
      </InfoSection>
    </ResultsPanel>
  );

  return <TwoPane form={form} results={results} />;
}
