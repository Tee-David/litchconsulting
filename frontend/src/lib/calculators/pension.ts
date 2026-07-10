/**
 * Pension calculator — Contributory Pension Scheme (Pension Reform Act 2014).
 * Employee 8% + Employer 10% (or employer-only 20%). Optional RSA projection.
 */
import {
  PENSION_EMPLOYEE_RATE,
  PENSION_EMPLOYER_ONLY_RATE,
  PENSION_EMPLOYER_RATE,
} from "./constants";

export interface PensionInput {
  /** Monthly pensionable emolument (basic + housing + transport). */
  monthlyEmolument: number;
  mode?: "split" | "employer-only";
  /** Optional projection. */
  currentBalance?: number;
  yearsToRetirement?: number;
  annualReturnPct?: number;
}

export interface PensionResult {
  employeeMonthly: number;
  employerMonthly: number;
  totalMonthly: number;
  totalAnnual: number;
  employeeRate: number;
  employerRate: number;
  projectedBalance?: number;
}

export function computePension(input: PensionInput): PensionResult {
  const base = Math.max(0, input.monthlyEmolument || 0);
  const employeeRate = input.mode === "employer-only" ? 0 : PENSION_EMPLOYEE_RATE;
  const employerRate =
    input.mode === "employer-only" ? PENSION_EMPLOYER_ONLY_RATE : PENSION_EMPLOYER_RATE;

  const employeeMonthly = base * employeeRate;
  const employerMonthly = base * employerRate;
  const totalMonthly = employeeMonthly + employerMonthly;

  const result: PensionResult = {
    employeeMonthly,
    employerMonthly,
    totalMonthly,
    totalAnnual: totalMonthly * 12,
    employeeRate,
    employerRate,
  };

  const years = Math.max(0, input.yearsToRetirement || 0);
  if (years > 0) {
    const r = (input.annualReturnPct ?? 0) / 100 / 12;
    const n = Math.round(years * 12);
    let bal = Math.max(0, input.currentBalance || 0);
    for (let i = 0; i < n; i++) bal = bal * (1 + r) + totalMonthly;
    result.projectedBalance = bal;
  }

  return result;
}
