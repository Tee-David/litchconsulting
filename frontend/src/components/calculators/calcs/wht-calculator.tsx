"use client";

import { useState } from "react";
import { formatMoney, num } from "@/lib/invoice/money";
import { computeWht, WHT_RATES, type WhtCategory } from "@/lib/calculators/wht";
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
  Select,
  TwoPane,
} from "@/components/calculators/ui";

const AMOUNT_PRESETS = [100_000, 500_000, 1_000_000, 5_000_000, 10_000_000];

const CATEGORY_OPTIONS: { value: WhtCategory; label: string }[] = Object.entries(WHT_RATES).map(
  ([key, val]) => ({ value: key as WhtCategory, label: val.label }),
);

export function WhtCalculator() {
  const [amount, setAmount] = useState("1000000");
  const [category, setCategory] = useState<WhtCategory>("consultancy");
  const [entity, setEntity] = useState<"corporate" | "individual">("corporate");

  const r = computeWht({ amount: num(amount), category, entityType: entity });
  const f = (n: number) => formatMoney(n);

  const form = (
    <>
      <Field label="Transaction amount">
        <MoneyInput value={amount} onChange={setAmount} />
      </Field>
      <PresetButtons presets={AMOUNT_PRESETS} onSelect={(v) => setAmount(String(v))} active={num(amount)} prefix="₦" />
      <Field label="Transaction type">
        <Select options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
      </Field>
      <Field label="Entity type">
        <Segmented
          value={entity}
          onChange={setEntity}
          options={[
            { value: "corporate", label: "Corporate" },
            { value: "individual", label: "Individual" },
          ]}
        />
      </Field>
    </>
  );

  const results = (
    <ResultsPanel>
      <span className="mb-4 block text-sm font-semibold text-ink">WHT breakdown</span>
      <Headline label={`WHT (${r.ratePct}%)`} value={f(r.wht)} />
      <div className="mt-2">
        <ResultRow label="Gross amount" value={f(r.gross)} />
        <ResultRow label={`WHT @ ${r.ratePct}%`} value={f(r.wht)} accent />
        <ResultRow label="Net after WHT" value={f(r.net)} strong />
      </div>
      <Disclaimer>WHT is a credit against the final tax liability. Deduct and remit to FIRS within 21 days of the transaction.</Disclaimer>
      <InfoSection
        references={[
          { label: "FIRS — Withholding Tax", url: "https://www.firs.gov.ng/tax-types/withholding-tax/" },
          { label: "WHT Rate Schedule (FIRS)", url: "https://www.firs.gov.ng/wp-content/uploads/2023/WHT-Rate-Schedule.pdf" },
        ]}
      >
        <p>Withholding Tax (WHT) in Nigeria is an advance payment of income tax. It is deducted at source from qualifying transactions and remitted to FIRS. WHT is NOT a final tax — it is a credit against the payee&apos;s assessed tax.</p>
        <p className="mt-2"><strong>Key rates:</strong> 10% for dividends, interest, rent, royalties, and professional fees (corporate); 5% for construction, supply of goods, and some professional fees (individual).</p>
      </InfoSection>
    </ResultsPanel>
  );

  return <TwoPane form={form} results={results} />;
}
