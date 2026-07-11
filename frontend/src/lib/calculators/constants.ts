/**
 * Nigerian tax & finance constants — 2026.
 *
 * All statutory rates are read from lib/tax/nigeria-tax-config.json — the
 * shared, versioned source of truth for the site calculators and the LitchAI
 * template compilers (plans/prd.md §12). Change rates there, not here.
 */
import taxConfig from "@/lib/tax/nigeria-tax-config.json";

/** Progressive PAYE/PIT bands (annual chargeable income). JRB 2026 Appendix 1. */
export const PIT_BANDS_2026: { width: number; rate: number; label: string }[] =
  taxConfig.paye.bands.map((b) => ({
    width: b.width ?? Infinity,
    rate: b.ratePct / 100,
    label: b.label,
  }));

/** Rent relief: 20% of annual rent, capped at ₦500,000 (JRB §9). */
export const RENT_RELIEF_RATE = taxConfig.paye.rentRelief.ratePct / 100;
export const RENT_RELIEF_CAP = taxConfig.paye.rentRelief.cap;

/** Pension (Pension Reform Act 2014): employee 8%, employer 10%. */
export const PENSION_EMPLOYEE_RATE = taxConfig.payroll.pension.employeePct / 100;
export const PENSION_EMPLOYER_RATE = taxConfig.payroll.pension.employerPct / 100;
export const PENSION_EMPLOYER_ONLY_RATE = taxConfig.payroll.pension.employerOnlyPct / 100;

/** National Housing Fund: 2.5% of basic salary. */
export const NHF_RATE = taxConfig.payroll.nhf.employeePct / 100;

/** VAT (Nigeria Tax Act 2025). */
export const VAT_RATE = taxConfig.vat.standardRatePct;

/** National minimum wage (monthly) — earners at/below are PAYE-exempt. */
export const MINIMUM_WAGE_MONTHLY = taxConfig.paye.minimumWageMonthly;

/**
 * Import duty components (Nigeria Customs / ECOWAS CET). Duty rate itself is
 * HS-code specific (5–50%) and supplied by the user.
 * Sources: sgkglobal.com, skyweb.com.ng (2026 formula), Nigeria Customs.
 */
export const IMPORT_SURCHARGE_RATE = 0.07; // 7% of import duty (port surcharge)
export const IMPORT_ETLS_RATE = 0.005; // 0.5% of CIF (ECOWAS levy)
export const IMPORT_CISS_RATE = 0.01; // 1% of CIF (inspection levy)
export const IMPORT_VAT_RATE = 0.075; // 7.5% of (CIF + duty + surcharge + levies)
