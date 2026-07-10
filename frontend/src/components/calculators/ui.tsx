"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* --------------------------------- Field ---------------------------------- */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-body">
        {label}
        {hint && <span className="font-normal text-muted">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-hairline bg-paper px-3.5 py-2.5 text-sm text-ink outline-none transition-colors tabular-nums placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15";

/* ------------------------------- MoneyInput ------------------------------- */
export function MoneyInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const clean = value.replace(/[^0-9.]/g, "");
  const display =
    clean === "" ? "" : clean.endsWith(".") ? clean : Number(clean).toLocaleString("en-NG");
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">
        ₦
      </span>
      <input
        inputMode="decimal"
        value={display}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder={placeholder ?? "0"}
        className={cn(inputCls, "pl-8")}
      />
    </div>
  );
}

/* ------------------------------ NumberInput ------------------------------- */
export function NumberInput({
  value,
  onChange,
  suffix,
  step,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(inputCls, suffix && "pr-9")}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">
          {suffix}
        </span>
      )}
    </div>
  );
}

/* -------------------------------- Segmented ------------------------------- */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-hairline bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors",
            value === o.value ? "bg-brand text-white shadow-sm" : "text-body hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------- Toggle --------------------------------- */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-body">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-brand"
      />
      {label}
    </label>
  );
}

/* -------------------------------- Stepper --------------------------------- */
export function Stepper({
  steps,
  current,
  onStep,
}: {
  steps: string[];
  current: number;
  onStep: (i: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => (
        <button
          key={s}
          type="button"
          onClick={() => onStep(i)}
          className="flex items-center gap-1.5"
        >
          <span
            className={cn(
              "grid size-6 place-items-center rounded-full text-xs font-semibold transition-colors",
              i === current
                ? "bg-brand text-white"
                : i < current
                  ? "bg-brand/15 text-brand"
                  : "bg-surface text-muted",
            )}
          >
            {i + 1}
          </span>
          <span
            className={cn(
              "text-xs font-medium",
              i === current ? "text-ink" : "text-muted",
              "hidden sm:inline",
            )}
          >
            {s}
          </span>
          {i < steps.length - 1 && <span className="mx-1 h-px w-4 bg-hairline sm:w-6" />}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------- ResultRow -------------------------------- */
export function ResultRow({
  label,
  value,
  strong,
  accent,
}: {
  label: string;
  value: string;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 py-2",
        strong && "mt-1 border-t border-hairline pt-3",
      )}
    >
      <span className={cn("text-sm", strong ? "font-semibold text-ink" : "text-body")}>{label}</span>
      <span
        className={cn(
          "tabular-nums",
          strong ? "font-display text-lg font-bold" : "text-sm font-medium",
          accent ? "text-brand dark:text-highlight" : "text-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* ------------------------------- Disclaimer ------------------------------- */
export function Disclaimer({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 text-[11px] leading-relaxed text-muted">
      {children}
    </p>
  );
}

/* -------------------------------- Layout ---------------------------------- */
export function TwoPane({ form, results }: { form: ReactNode; results: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-5">{form}</div>
      <div>{results}</div>
    </div>
  );
}

export function ResultsPanel({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-4 rounded-2xl border border-hairline bg-gradient-to-b from-surface to-paper p-5 md:p-6">
      {children}
    </div>
  );
}

export function Headline({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-5">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="font-display text-3xl font-bold tabular-nums text-ink md:text-[2.5rem] md:leading-tight">
        {value}
      </p>
    </div>
  );
}

/* Chart palette aligned with the brand. */
export const CHART_COLORS = ["#0a196d", "#2540c4", "#4c6ef5", "#8aa0f2", "#c2cef8", "#e0574a"];
