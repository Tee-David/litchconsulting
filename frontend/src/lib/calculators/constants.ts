/**
 * Nigerian tax & finance constants — 2026.
 *
 * Primary source: Joint Revenue Board of Nigeria, "Personal Income Tax
 * Guidelines 2026" (under the Nigeria Tax Act 2025), Appendix 1. Non-PIT rates
 * are noted with their sources and are user-editable in the UI.
 */

/** Progressive PAYE/PIT bands (annual chargeable income). JRB 2026 Appendix 1. */
export const PIT_BANDS_2026: { width: number; rate: number; label: string }[] = [
  { width: 800_000, rate: 0, label: "First ₦800,000" },
  { width: 2_200_000, rate: 0.15, label: "Next ₦2,200,000" },
  { width: 9_000_000, rate: 0.18, label: "Next ₦9,000,000" },
  { width: 13_000_000, rate: 0.21, label: "Next ₦13,000,000" },
  { width: 25_000_000, rate: 0.23, label: "Next ₦25,000,000" },
  { width: Infinity, rate: 0.25, label: "Above ₦50,000,000" },
];

/** Rent relief: 20% of annual rent, capped at ₦500,000 (JRB §9). */
export const RENT_RELIEF_RATE = 0.2;
export const RENT_RELIEF_CAP = 500_000;

/** Pension (Pension Reform Act 2014): employee 8%, employer 10%. */
export const PENSION_EMPLOYEE_RATE = 0.08;
export const PENSION_EMPLOYER_RATE = 0.1;
export const PENSION_EMPLOYER_ONLY_RATE = 0.2;

/** National Housing Fund: 2.5% of basic salary. */
export const NHF_RATE = 0.025;

/** VAT (Nigeria Tax Act 2025). */
export const VAT_RATE = 7.5;

/** National minimum wage (monthly) — earners at/below are PAYE-exempt. */
export const MINIMUM_WAGE_MONTHLY = 70_000;

/**
 * Import duty components (Nigeria Customs / ECOWAS CET). Duty rate itself is
 * HS-code specific (5–50%) and supplied by the user.
 * Sources: sgkglobal.com, skyweb.com.ng (2026 formula), Nigeria Customs.
 */
export const IMPORT_SURCHARGE_RATE = 0.07; // 7% of import duty (port surcharge)
export const IMPORT_ETLS_RATE = 0.005; // 0.5% of CIF (ECOWAS levy)
export const IMPORT_CISS_RATE = 0.01; // 1% of CIF (inspection levy)
export const IMPORT_VAT_RATE = 0.075; // 7.5% of (CIF + duty + surcharge + levies)
