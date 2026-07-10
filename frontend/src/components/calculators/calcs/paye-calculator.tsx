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
  MoneyInput,
  ResultRow,
  ResultsPanel,
  Segmented,
  Stepper,
  Toggle,
  TwoPane,
} from "@/components/calculators/ui";

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
        <Stepper steps={["Income", "Reliefs"]} current={step} onStep={setStep} />
      </div>

      {step === 0 ? (
        <div className="space-y-5">
          <Field label="How is your income quoted?">
            <Segmented
              value={period}
              onChange={setPeriod}
              options={[
                { value: "monthly", label: "Monthly" },
                { value: "annual", label: "Annual" },
              ]}
            />
          </Field>
          <Field label={`Gross ${period} income`} hint="Salary + allowances">
            <MoneyInput value={gross} onChange={setGross} />
          </Field>
          <button
            type="button"
            onClick={() => setStep(1)}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
          >
            Add reliefs <ArrowRight className="size-4" />
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2.5 rounded-xl border border-hairline bg-surface/50 p-4">
            <Toggle checked={pensionOn} onChange={setPensionOn} label="Pension (8% employee)" />
            <Toggle checked={nhfOn} onChange={setNhfOn} label="National Housing Fund (2.5%)" />
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
    </ResultsPanel>
  );

  return <TwoPane form={form} results={results} />;
}
