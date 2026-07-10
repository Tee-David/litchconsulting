"use client";

import { useState } from "react";
import { formatMoney, num } from "@/lib/invoice/money";
import { computeVat } from "@/lib/calculators/vat";
import {
  Disclaimer,
  Field,
  Headline,
  MoneyInput,
  NumberInput,
  ResultRow,
  ResultsPanel,
  Toggle,
  TwoPane,
} from "@/components/calculators/ui";

export function VatCalculator() {
  const [amount, setAmount] = useState("100000");
  const [rate, setRate] = useState("7.5");
  const [inclusive, setInclusive] = useState(false);

  const v = computeVat({ amount: num(amount), ratePct: num(rate), inclusive });
  const f = (n: number) => formatMoney(n);

  const form = (
    <>
      <Field label="Amount">
        <MoneyInput value={amount} onChange={setAmount} />
      </Field>
      <Field label="VAT rate">
        <NumberInput value={rate} onChange={setRate} suffix="%" step="0.5" />
      </Field>
      <div className="rounded-xl border border-hairline bg-surface/50 p-4">
        <Toggle checked={inclusive} onChange={setInclusive} label="Amount already includes VAT" />
      </div>
    </>
  );

  const results = (
    <ResultsPanel>
      <span className="mb-4 block text-sm font-semibold text-ink">VAT breakdown</span>
      <Headline label={`VAT (${v.ratePct}%)`} value={f(v.vat)} />
      <div className="mt-2">
        <ResultRow label="Net (excl. VAT)" value={f(v.net)} />
        <ResultRow label={`VAT (${v.ratePct}%)`} value={f(v.vat)} accent />
        <ResultRow label="Gross (incl. VAT)" value={f(v.gross)} strong />
      </div>
      <Disclaimer>Nigeria standard VAT rate is 7.5%. Adjust the rate for exempt/zero-rated items.</Disclaimer>
    </ResultsPanel>
  );

  return <TwoPane form={form} results={results} />;
}
