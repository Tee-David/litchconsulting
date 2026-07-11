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

/* ------------------------------- InfoSection ------------------------------ */
export function InfoSection({
  title,
  children,
  references,
}: {
  title?: string;
  children: ReactNode;
  references?: { label: string; url: string }[];
}) {
  return (
    <details className="group mt-5 rounded-xl border border-hairline bg-surface/50 open:bg-surface/80">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-xs font-semibold text-ink select-none [&::-webkit-details-marker]:hidden">
        <svg
          className="size-3.5 shrink-0 text-muted transition-transform group-open:rotate-90"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        {title ?? "Official information & references"}
      </summary>
      <div className="space-y-3 border-t border-hairline px-4 pb-4 pt-3 text-xs leading-relaxed text-body">
        {children}
        {references && references.length > 0 && (
          <div className="space-y-1.5 border-t border-hairline pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">References & downloads</p>
            {references.map((ref) => (
              <a
                key={ref.url}
                href={ref.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-brand hover:underline dark:text-highlight"
              >
                <svg className="size-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
                </svg>
                {ref.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </details>
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

/* ------------------------------ SliderInput ------------------------------- */
export function SliderInput({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  suffix,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  label?: string;
}) {
  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between text-xs font-medium text-body">
          <span>{label}</span>
          <span className="tabular-nums text-ink">
            {value.toLocaleString("en-NG")}
            {suffix}
          </span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer accent-brand"
      />
      <div className="flex justify-between text-[10px] text-muted">
        <span>
          {min.toLocaleString("en-NG")}
          {suffix}
        </span>
        <span>
          {max.toLocaleString("en-NG")}
          {suffix}
        </span>
      </div>
    </div>
  );
}

/* ----------------------------- PresetButtons ------------------------------ */
export function PresetButtons({
  presets,
  onSelect,
  active,
  prefix,
}: {
  presets: number[];
  onSelect: (v: number) => void;
  active?: number;
  prefix?: string;
}) {
  const fmt = (n: number) => {
    if (n >= 1_000_000) return `${n / 1_000_000}M`;
    if (n >= 1_000) return `${n / 1_000}K`;
    return String(n);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onSelect(p)}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-xs font-medium tabular-nums transition-colors",
            active === p
              ? "border-brand bg-brand/10 text-brand dark:text-highlight"
              : "border-hairline text-body hover:border-brand/40 hover:text-ink",
          )}
        >
          {prefix}
          {fmt(p)}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------- Select ---------------------------------- */
export function Select<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn(inputCls, "cursor-pointer appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9")}
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' viewBox='0 0 24 24' stroke='%238a92a6' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")` }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ----------------------------- StepperInput ------------------------------- */
export function StepperInput({
  value,
  onChange,
  min = 0,
  max = Infinity,
  step = 1,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));
  const btnCls =
    "grid size-9 place-items-center rounded-lg border border-hairline text-body transition-colors hover:bg-surface hover:text-ink active:bg-brand/10 active:text-brand";
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={dec} className={btnCls} aria-label="Decrease">
        −
      </button>
      <span className="min-w-[4rem] text-center font-display text-lg font-bold tabular-nums text-ink">
        {value.toLocaleString("en-NG")}
        {suffix && <span className="ml-0.5 text-sm font-medium text-muted">{suffix}</span>}
      </span>
      <button type="button" onClick={inc} className={btnCls} aria-label="Increase">
        +
      </button>
    </div>
  );
}

/* Chart palette aligned with the brand. */
export const CHART_COLORS = ["#0a196d", "#2540c4", "#4c6ef5", "#8aa0f2", "#c2cef8", "#e0574a"];
