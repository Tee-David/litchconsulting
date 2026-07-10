"use client";

import { useState } from "react";
import { formatMoney, num } from "@/lib/invoice/money";
import { computeImportDuty } from "@/lib/calculators/import-duty";
import { Select } from "@/components/ui/select";
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

const DUTY_PRESETS = [
  { value: "5", label: "5% — raw materials / machinery" },
  { value: "10", label: "10% — intermediate goods" },
  { value: "20", label: "20% — finished goods" },
  { value: "35", label: "35% — vehicles / luxury" },
  { value: "custom", label: "Custom rate…" },
];

export function ImportDutyCalculator() {
  const [cif, setCif] = useState("10000000");
  const [preset, setPreset] = useState("20");
  const [custom, setCustom] = useState("20");

  const dutyRatePct = preset === "custom" ? num(custom) : num(preset);
  const r = computeImportDuty({ cif: num(cif), dutyRatePct });
  const f = (n: number) => formatMoney(n);

  const form = (
    <>
      <Field label="CIF value" hint="cost + insurance + freight, in ₦">
        <MoneyInput value={cif} onChange={setCif} />
      </Field>
      <Field label="Import duty rate (by HS category)">
        <Select value={preset} onChange={setPreset} options={DUTY_PRESETS} />
      </Field>
      {preset === "custom" && (
        <Field label="Custom duty rate">
          <NumberInput value={custom} onChange={setCustom} suffix="%" step="1" />
        </Field>
      )}
      <div className="rounded-xl border border-hairline bg-surface/50 p-4 text-xs leading-relaxed text-muted">
        Levies applied: 7% port surcharge (of duty), 0.5% ETLS + 1% CISS (of CIF), and 7.5% import
        VAT on the duty-inclusive value.
      </div>
    </>
  );

  const results = (
    <ResultsPanel>
      <span className="mb-4 block text-sm font-semibold text-ink">Landed cost</span>
      <Headline label="Total landed cost" value={f(r.landedCost)} />
      <div className="mt-2">
        <ResultRow label="CIF value" value={f(r.cif)} />
        {r.lines.map((line) => (
          <ResultRow key={line.label} label={line.label} value={f(line.amount)} />
        ))}
        <ResultRow label="Total charges" value={f(r.totalCharges)} accent />
        <ResultRow label="Landed cost" value={f(r.landedCost)} strong />
      </div>
      <Disclaimer>
        Estimate based on the ECOWAS CET & Nigeria Customs levy structure. Actual duty depends on the
        item&apos;s HS code and current tariff schedule.
      </Disclaimer>
    </ResultsPanel>
  );

  return <TwoPane form={form} results={results} />;
}
