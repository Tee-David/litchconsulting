"use client";

import { ArrowLeft } from "lucide-react";
import { getCalculator } from "./registry";

export function CalculatorShell({ calcKey, onBack }: { calcKey: string; onBack: () => void }) {
  const calc = getCalculator(calcKey);
  if (!calc) return null;
  const Component = calc.Component;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to calculators"
          className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-hairline text-body transition-colors hover:bg-surface hover:text-ink"
        >
          <ArrowLeft className="size-4" />
        </button>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand keep-brand dark:bg-white/10 dark:text-white">
          <calc.icon className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-lg font-bold tracking-tight text-ink">{calc.name}</h3>
          <p className="text-sm text-body">{calc.blurb}</p>
        </div>
      </div>
      <Component />
    </div>
  );
}
