/**
 * Salary calculator — gross → net take-home (Nigeria 2026).
 * Statutory deductions (pension, NHF, NHIS) are both tax reliefs AND real
 * deductions from take-home pay.
 */
import { NHF_RATE, PENSION_EMPLOYEE_RATE } from "./constants";
import { computePaye, type PayeResult } from "./paye";

export interface SalaryInput {
  grossAnnual: number;
  /** Employee pension (8%). */
  includePension?: boolean;
  /** NHF (2.5% of basic). */
  includeNhf?: boolean;
  /** Portion of gross treated as basic for NHF (0–1, default 1). */
  basicPortion?: number;
  /** NHIS contribution (annual, actual). */
  nhis?: number;
  /** Annual rent paid → rent relief. */
  rentPaid?: number;
}

export interface SalaryResult {
  grossAnnual: number;
  pension: number;
  nhf: number;
  nhis: number;
  paye: PayeResult;
  totalDeductionsAnnual: number;
  netAnnual: number;
  netMonthly: number;
}

export function computeSalary(input: SalaryInput): SalaryResult {
  const grossAnnual = Math.max(0, input.grossAnnual || 0);
  const basic = grossAnnual * (input.basicPortion ?? 1);
  const pension = input.includePension ? grossAnnual * PENSION_EMPLOYEE_RATE : 0;
  const nhf = input.includeNhf ? basic * NHF_RATE : 0;
  const nhis = Math.max(0, input.nhis || 0);

  const paye = computePaye({
    grossAnnual,
    pension,
    nhf,
    nhis,
    rentPaid: input.rentPaid,
  });

  const totalDeductionsAnnual = paye.annualTax + pension + nhf + nhis;
  const netAnnual = grossAnnual - totalDeductionsAnnual;

  return {
    grossAnnual,
    pension,
    nhf,
    nhis,
    paye,
    totalDeductionsAnnual,
    netAnnual,
    netMonthly: netAnnual / 12,
  };
}
