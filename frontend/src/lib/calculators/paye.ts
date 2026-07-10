/**
 * PAYE / Personal Income Tax engine — Nigeria 2026 (JRB Guidelines, Appendix 1).
 *
 * Chargeable income = gross annual emolument − eligible deductions
 * (pension + NHF + NHIS + life insurance + owner-occupied loan interest + rent
 * relief). Tax is then charged progressively across the 2026 bands.
 */
import { PIT_BANDS_2026, RENT_RELIEF_CAP, RENT_RELIEF_RATE } from "./constants";

export interface PayeInput {
  /** Total annual employment income (salary + allowances + taxable BIK). */
  grossAnnual: number;
  /** Pension contributed by the employee (annual). */
  pension?: number;
  /** National Housing Fund (annual). */
  nhf?: number;
  /** National Health Insurance Scheme (annual). */
  nhis?: number;
  /** Life insurance / annuity premium (annual). */
  lifeInsurance?: number;
  /** Interest on loan for an owner-occupied residential house (annual). */
  loanInterest?: number;
  /** Annual rent paid — used to derive the capped rent relief. */
  rentPaid?: number;
}

export interface BandCharge {
  label: string;
  rate: number;
  taxable: number;
  tax: number;
}

export interface PayeResult {
  grossAnnual: number;
  reliefs: {
    pension: number;
    nhf: number;
    nhis: number;
    lifeInsurance: number;
    loanInterest: number;
    rentRelief: number;
    total: number;
  };
  chargeableIncome: number;
  bands: BandCharge[];
  annualTax: number;
  monthlyTax: number;
  /** Income after tax only (not counting statutory deductions). */
  annualAfterTax: number;
  effectiveRate: number;
}

/** Rent relief = min(20% of annual rent, ₦500,000). */
export function rentRelief(rentPaid: number): number {
  return Math.min(rentPaid * RENT_RELIEF_RATE, RENT_RELIEF_CAP);
}

/** Charge tax progressively across the 2026 bands. */
export function taxOnChargeable(chargeable: number): BandCharge[] {
  const bands: BandCharge[] = [];
  let remaining = Math.max(0, chargeable);
  for (const band of PIT_BANDS_2026) {
    if (remaining <= 0) break;
    const taxable = Math.min(remaining, band.width);
    bands.push({ label: band.label, rate: band.rate, taxable, tax: taxable * band.rate });
    remaining -= taxable;
  }
  return bands;
}

export function computePaye(input: PayeInput): PayeResult {
  const grossAnnual = Math.max(0, input.grossAnnual || 0);
  const reliefs = {
    pension: Math.max(0, input.pension || 0),
    nhf: Math.max(0, input.nhf || 0),
    nhis: Math.max(0, input.nhis || 0),
    lifeInsurance: Math.max(0, input.lifeInsurance || 0),
    loanInterest: Math.max(0, input.loanInterest || 0),
    rentRelief: rentRelief(Math.max(0, input.rentPaid || 0)),
    total: 0,
  };
  reliefs.total =
    reliefs.pension +
    reliefs.nhf +
    reliefs.nhis +
    reliefs.lifeInsurance +
    reliefs.loanInterest +
    reliefs.rentRelief;

  const chargeableIncome = Math.max(0, grossAnnual - reliefs.total);
  const bands = taxOnChargeable(chargeableIncome);
  const annualTax = bands.reduce((s, b) => s + b.tax, 0);

  return {
    grossAnnual,
    reliefs,
    chargeableIncome,
    bands,
    annualTax,
    monthlyTax: annualTax / 12,
    annualAfterTax: grossAnnual - annualTax,
    effectiveRate: grossAnnual > 0 ? annualTax / grossAnnual : 0,
  };
}
