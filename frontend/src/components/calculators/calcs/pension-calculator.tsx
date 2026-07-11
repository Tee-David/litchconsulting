"use client";

import { useState } from "react";
import { DonutChart } from "@/components/admin/ui/charts";
import { formatMoney, num } from "@/lib/invoice/money";
import { computePension } from "@/lib/calculators/pension";
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

const EMOLUMENT_PRESETS = [100_000, 200_000, 500_000, 1_000_000, 2_000_000, 5_000_000];

export function PensionCalculator() {
  const [emolument, setEmolument] = useState("400000");
  const [mode, setMode] = useState<"split" | "employer-only">("split");
  const [balance, setBalance] = useState("1000000");
  const [years, setYears] = useState(25);
  const [ret, setRet] = useState(10);

  const p = computePension({
    monthlyEmolument: num(emolument),
    mode,
    currentBalance: num(balance),
    yearsToRetirement: years,
    annualReturnPct: ret,
  });
  const f = (n: number) => formatMoney(n);

  const form = (
    <>
      <div className="space-y-4">
        <Field label="Monthly pensionable emolument" hint="Basic + Housing + Transport">
          <MoneyInput value={emolument} onChange={setEmolument} />
        </Field>
        <PresetButtons
          presets={EMOLUMENT_PRESETS}
          onSelect={(v) => setEmolument(String(v))}
          active={num(emolument)}
          prefix="₦"
        />
        
        <Field label="Contribution structure">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "split", label: "Shared (8% Employee + 10% Employer)" },
              { value: "employer-only", label: "Employer Pays All (20%)" },
            ]}
          />
        </Field>

        <div className="rounded-xl border border-hairline bg-surface/50 p-4 space-y-4">
          <p className="text-xs font-semibold text-ink uppercase tracking-wider">Retirement Projection</p>
          
          <Field label="Current RSA balance">
            <MoneyInput value={balance} onChange={setBalance} />
          </Field>

          <SliderInput
            label="Years to retirement"
            value={years}
            onChange={setYears}
            min={1}
            max={45}
            step={1}
            suffix=" years"
          />

          <SliderInput
            label="Expected annual return rate"
            value={ret}
            onChange={setRet}
            min={4}
            max={25}
            step={0.5}
            suffix="%"
          />
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

      {/* Friendly intuitive summary card */}
      <div className="mt-5 rounded-xl bg-brand/5 border border-brand/10 p-4 text-xs leading-relaxed text-ink">
        <p>
          💡 Every month, <strong>{f(p.totalMonthly)}</strong> is saved into your Retirement Savings Account (RSA). 
          Over a year, this accumulates to <strong>{f(p.totalAnnual)}</strong> in retirement savings.
          {p.projectedBalance != null && p.projectedBalance > 0 && (
            <>
              {" "}With a compounding growth of <strong>{ret}%</strong> annually, your balance is projected to reach{" "}
              <strong>{f(p.projectedBalance)}</strong> in <strong>{years} years</strong> when you retire.
            </>
          )}
        </p>
      </div>

      <div className="mt-5">
        <ResultRow label={`Employee (${Math.round(p.employeeRate * 100)}%)`} value={f(p.employeeMonthly)} />
        <ResultRow label={`Employer (${Math.round(p.employerRate * 100)}%)`} value={f(p.employerMonthly)} />
        <ResultRow label="Total per year" value={f(p.totalAnnual)} accent />
        {p.projectedBalance != null && p.projectedBalance > 0 && (
          <ResultRow label="Projected balance at retirement" value={f(p.projectedBalance)} strong />
        )}
      </div>

      <Disclaimer>Contributory Pension Scheme, Pension Reform Act 2014. Projection assumes level contributions and constant annual returns.</Disclaimer>

      <InfoSection
        references={[
          { label: "PenCom — Contributory Pension Scheme Guide", url: "https://www.pencom.gov.ng/" },
          { label: "Pension Reform Act 2014 (PDF)", url: "https://www.pencom.gov.ng/wp-content/uploads/2019/02/Pension_Reform_Act_2014.pdf" },
        ]}
      >
        <p>The Contributory Pension Scheme (CPS) is mandatory for employers with 15 or more employees in Nigeria. It is regulated by the National Pension Commission (PenCom).</p>
        <p className="mt-2"><strong>Minimum rates:</strong> The minimum contribution is 18% of the employee&apos;s monthly emolument (8% contributed by the employee, and 10% by the employer). Alternatively, the employer can choose to bear the full cost by contributing at least 20%.</p>
        <p className="mt-2"><strong>Tax relief:</strong> Pension contributions are fully tax-deductible under the Personal Income Tax Act (PITA), meaning they are subtracted from your gross income before income tax is calculated.</p>
      </InfoSection>
    </ResultsPanel>
  );

  return <TwoPane form={form} results={results} />;
}
