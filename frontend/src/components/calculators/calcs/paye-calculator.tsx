"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { DonutChart } from "@/components/admin/ui/charts";
import { formatMoney, num } from "@/lib/invoice/money";
import { computePaye } from "@/lib/calculators/paye";
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
  Stepper,
  Toggle,
  TwoPane,
} from "@/components/calculators/ui";

const SALARY_PRESETS_MONTHLY = [150_000, 300_000, 500_000, 1_000_000, 2_000_000, 5_000_000];
const SALARY_PRESETS_ANNUAL = [3_000_000, 5_000_000, 10_000_000, 20_000_000, 50_000_000];

export function PayeCalculator() {
  const [step, setStep] = useState(0);
  const [period, setPeriod] = useState<"annual" | "monthly">("monthly");
  const [gross, setGross] = useState("1000000");
  const [pensionOn, setPensionOn] = useState(true);
  const [nhfOn, setNhfOn] = useState(false);
  const [nhis, setNhis] = useState("");
  const [life, setLife] = useState("");
  const [loanInterest, setLoanInterest] = useState("");
  const [rent, setRent] = useState("");
  const [view, setView] = useState<"monthly" | "annual">("monthly");

  const grossAnnual = period === "annual" ? num(gross) : num(gross) * 12;
  const pension = pensionOn ? grossAnnual * 0.08 : 0;
  const nhf = nhfOn ? grossAnnual * 0.025 : 0;

  const r = computePaye({
    grossAnnual,
    pension,
    nhf,
    nhis: num(nhis),
    lifeInsurance: num(life),
    loanInterest: num(loanInterest),
    rentPaid: num(rent),
  });
  const statutory = pension + nhf + num(nhis);
  const netAnnual = grossAnnual - r.annualTax - statutory;
  const d = view === "monthly" ? 12 : 1;
  const f = (n: number) => formatMoney(n / d);

  const form = (
    <>
      <div className="flex items-center justify-between">
        <Stepper steps={["Income & Presets", "Allowances & Reliefs"]} current={step} onStep={setStep} />
      </div>

      {step === 0 ? (
        <div className="space-y-5">
          <Field label="How is your income quoted?">
            <Segmented
              value={period}
              onChange={setPeriod}
              options={[
                { value: "monthly", label: "Monthly Income" },
                { value: "annual", label: "Annual Salary" },
              ]}
            />
          </Field>
          
          <Field label={`Gross ${period} income`} hint="Salary + basic allowances">
            <MoneyInput value={gross} onChange={setGross} />
          </Field>

          <PresetButtons
            presets={period === "monthly" ? SALARY_PRESETS_MONTHLY : SALARY_PRESETS_ANNUAL}
            onSelect={(v) => setGross(String(v))}
            active={num(gross)}
            prefix="₦"
          />

          <SliderInput
            label={`Adjust Gross ${period} income`}
            value={num(gross)}
            onChange={(v) => setGross(String(v))}
            min={period === "monthly" ? 50_000 : 500_000}
            max={period === "monthly" ? 5_000_000 : 60_000_000}
            step={period === "monthly" ? 25_000 : 250_000}
            suffix=""
          />

          <button
            type="button"
            onClick={() => setStep(1)}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-hover keep-brand"
          >
            Add reliefs & deductions <ArrowRight className="size-4" />
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2.5 rounded-xl border border-hairline bg-surface/50 p-4">
            <Toggle checked={pensionOn} onChange={setPensionOn} label="Pension (8% employee contribution)" />
            <Toggle checked={nhfOn} onChange={setNhfOn} label="National Housing Fund (2.5% contribution)" />
          </div>
          <Field label="NHIS contribution" hint="annual, optional">
            <MoneyInput value={nhis} onChange={setNhis} />
          </Field>
          <Field label="Annual rent paid" hint="20% relief, capped ₦500k">
            <MoneyInput value={rent} onChange={setRent} />
          </Field>
          <Field label="Life insurance premium" hint="annual, optional">
            <MoneyInput value={life} onChange={setLife} />
          </Field>
          <Field label="Owner-occupied home-loan interest" hint="annual, optional">
            <MoneyInput value={loanInterest} onChange={setLoanInterest} />
          </Field>
          <button
            type="button"
            onClick={() => setStep(0)}
            className="inline-flex items-center gap-2 text-sm font-medium text-body transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" /> Back to income
          </button>
        </div>
      )}
    </>
  );

  const results = (
    <ResultsPanel>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">Your results</span>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "monthly", label: "Monthly" },
            { value: "annual", label: "Annual" },
          ]}
        />
      </div>
      <Headline label={`Take-home (${view})`} value={f(netAnnual)} />
      <DonutChart
        segments={[
          { label: "Take-home", value: Math.max(0, netAnnual), color: "#0a196d" },
          { label: "Tax", value: r.annualTax, color: "#e0574a" },
          { label: "Deductions", value: statutory, color: "#8aa0f2" },
        ]}
        centerValue={`${Math.round(r.effectiveRate * 100)}%`}
        centerLabel="effective tax"
      />

      {/* Friendly intuitive summary card */}
      <div className="mt-5 rounded-xl bg-brand/5 border border-brand/10 p-4 text-xs leading-relaxed text-ink">
        <p>
          💡 Out of your gross {view} income of <strong>{f(grossAnnual)}</strong>, you take home <strong>{f(netAnnual)}</strong>. 
          A total of <strong>{f(r.annualTax)}</strong> is paid in Personal Income Tax (PAYE), which represents an effective tax rate of <strong>{Math.round(r.effectiveRate * 100)}%</strong>. 
          Statutory deductions for pension and other schemes amount to <strong>{f(statutory)}</strong>.
        </p>
      </div>

      <div className="mt-5">
        <ResultRow label={`Gross income (${view})`} value={f(grossAnnual)} />
        <ResultRow label="Chargeable income" value={f(r.chargeableIncome)} />
        <ResultRow label="Pension + deductions" value={f(statutory)} />
        <ResultRow label={`Tax (${view})`} value={f(r.annualTax)} accent />
        <ResultRow label={`Net take-home (${view})`} value={f(netAnnual)} strong />
      </div>
      <Disclaimer>
        Based on the 2026 Personal Income Tax Guidelines (Nigeria Tax Act 2025). Estimates only —
        confirm with your tax adviser.
      </Disclaimer>
      <InfoSection
        references={[
          { label: "FIRS — Personal Income Tax Act (PITA)", url: "https://www.firs.gov.ng/tax-types/personal-income-tax/" },
          { label: "Finance Act 2023 — Key changes", url: "https://www.firs.gov.ng/finance-act/" },
          { label: "PAYE Computation Guide (PDF)", url: "https://www.firs.gov.ng/wp-content/uploads/2023/PAYE-Computation-Guide.pdf" },
        ]}
      >
        <p>Personal Income Tax (PAYE) in Nigeria is governed by the Personal Income Tax Act (PITA) as amended by the Finance Acts. Tax is computed on a graduated scale from 7% to 24% on chargeable income after allowable reliefs.</p>
        <p className="mt-2"><strong>Key reliefs:</strong> Consolidated Relief Allowance (CRA) of ₦200,000 + 20% of gross income; Pension (8% employee contribution); NHF (2.5%); Life insurance premiums; NHIS contributions.</p>
        <p className="mt-2"><strong>Tax bands:</strong> First ₦300K at 7%, next ₦300K at 11%, next ₦500K at 15%, next ₦500K at 19%, next ₦1.6M at 21%, above ₦3.2M at 24%.</p>
      </InfoSection>
    </ResultsPanel>
  );

  return <TwoPane form={form} results={results} />;
}
