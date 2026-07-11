"use client";

import { useState } from "react";
import { formatMoney, num } from "@/lib/invoice/money";
import { computeStampDuty, type StampDutyType } from "@/lib/calculators/stamp-duty";
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
  Select,
  TwoPane,
} from "@/components/calculators/ui";

const AMOUNT_PRESETS = [500_000, 1_000_000, 5_000_000, 10_000_000, 50_000_000, 100_000_000];

const TYPE_OPTIONS: { value: StampDutyType; label: string }[] = [
  { value: "property", label: "Property / deed transfer" },
  { value: "transfer", label: "Electronic bank transfer" },
  { value: "lease", label: "Lease / tenancy agreement" },
  { value: "insurance", label: "Insurance policy" },
];

export function StampDutyCalculator() {
  const [amount, setAmount] = useState("10000000");
  const [type, setType] = useState<StampDutyType>("property");
  const [leaseYears, setLeaseYears] = useState("3");

  const r = computeStampDuty({ amount: num(amount), type, leaseYears: num(leaseYears) });
  const f = (n: number) => formatMoney(n);

  const form = (
    <>
      <Field label="Transaction type">
        <Select options={TYPE_OPTIONS} value={type} onChange={setType} />
      </Field>
      <Field label={type === "property" ? "Property value / consideration" : type === "lease" ? "Annual rent" : type === "insurance" ? "Premium amount" : "Transfer amount"}>
        <MoneyInput value={amount} onChange={setAmount} />
      </Field>
      <PresetButtons presets={AMOUNT_PRESETS} onSelect={(v) => setAmount(String(v))} active={num(amount)} prefix="₦" />
      {type === "lease" && (
        <Field label="Lease duration" hint="years">
          <NumberInput value={leaseYears} onChange={setLeaseYears} suffix="yrs" />
        </Field>
      )}
    </>
  );

  const results = (
    <ResultsPanel>
      <span className="mb-4 block text-sm font-semibold text-ink">{r.typeLabel}</span>
      <Headline label="Stamp duty payable" value={f(r.duty)} />
      <div className="mt-2">
        <ResultRow label="Transaction value" value={f(r.amount)} />
        <ResultRow label="Stamp duty" value={f(r.duty)} accent />
        <ResultRow label="Total payable" value={f(r.netPayable)} strong />
      </div>
      <p className="mt-3 rounded-lg bg-surface p-3 text-xs text-body">{r.rateDescription}</p>
      <Disclaimer>Rates are based on the Stamp Duties Act and FIRS guidelines. Actual duties may vary based on instrument type and state regulations.</Disclaimer>
      <InfoSection
        references={[
          { label: "FIRS — Stamp Duties", url: "https://www.firs.gov.ng/tax-types/stamp-duties/" },
          { label: "Stamp Duties Act", url: "https://www.firs.gov.ng/wp-content/uploads/2023/Stamp-Duties-Act.pdf" },
          { label: "Electronic transfer duty circular", url: "https://www.firs.gov.ng/wp-content/uploads/2023/e-transfer-stamp-duty.pdf" },
        ]}
      >
        <p>Stamp Duty is a tax on instruments (documents) evidencing transactions. In Nigeria, it is governed by the Stamp Duties Act and administered jointly by FIRS (federal instruments) and state revenue services (state instruments).</p>
        <p className="mt-2"><strong>Property transfers:</strong> 1.5% of the property value or consideration, payable by the buyer.</p>
        <p className="mt-2"><strong>Bank transfers:</strong> ₦50 flat charge on electronic transfers of ₦10,000 and above (Finance Act 2020).</p>
        <p className="mt-2"><strong>Leases:</strong> Rate varies from 0.75% (≤7 years) to 1.5% (21+ years) of the annual rent.</p>
      </InfoSection>
    </ResultsPanel>
  );

  return <TwoPane form={form} results={results} />;
}
