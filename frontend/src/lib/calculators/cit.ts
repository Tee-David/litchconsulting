/**
 * Company Income Tax (CIT) — simplified estimate under the Nigeria Tax Act
 * 2025 (effective 1 Jan 2026):
 * - 0% for small companies: turnover ≤ ₦100m AND total fixed assets ≤ ₦250m,
 *   excluding businesses providing professional services (NTA §56).
 * - 30% standard rate otherwise (the Act's 25% reduction activates only by
 *   future presidential order).
 * - Development Levy at 4% of assessable profit (replaces TET/IT/NASENI/PTF
 *   levies); small companies exempt.
 * Rates come from lib/tax/nigeria-tax-config.json.
 */
import taxConfig from "@/lib/tax/nigeria-tax-config.json";

export interface CitInput {
  revenue: number;
  expenses: number;
  /** Total fixed assets — part of the small-company test (≤ ₦250m). */
  fixedAssets?: number;
  /** Professional-services firms are excluded from the small-company exemption. */
  professionalServices?: boolean;
}

export interface CitResult {
  revenue: number;
  expenses: number;
  fixedAssets: number;
  assessableProfit: number;
  isSmallCompany: boolean;
  citRate: number;
  cit: number;
  devLevyRate: number;
  devLevy: number;
  totalTax: number;
  netProfit: number;
  effectiveRate: number;
  tier: string;
}

export function computeCit(input: CitInput): CitResult {
  const cfg = taxConfig.cit;
  const revenue = Math.max(0, input.revenue || 0);
  const expenses = Math.max(0, input.expenses || 0);
  const fixedAssets = Math.max(0, input.fixedAssets || 0);
  const assessableProfit = Math.max(0, revenue - expenses);

  const isSmallCompany =
    !input.professionalServices &&
    revenue <= cfg.smallCompany.maxTurnover &&
    fixedAssets <= cfg.smallCompany.maxFixedAssets;

  const citRate = isSmallCompany ? cfg.smallCompany.ratePct : cfg.standardRatePct;
  const devLevyRate = isSmallCompany && cfg.smallCompany.developmentLevyExempt ? 0 : cfg.developmentLevy.ratePct;

  const cit = assessableProfit * (citRate / 100);
  const devLevy = assessableProfit * (devLevyRate / 100);
  const totalTax = cit + devLevy;
  const netProfit = assessableProfit - totalTax;
  const effectiveRate = assessableProfit > 0 ? (totalTax / assessableProfit) * 100 : 0;

  let tier: string;
  if (isSmallCompany) {
    tier = "Small company — exempt (≤ ₦100M turnover, ≤ ₦250M fixed assets)";
  } else if (input.professionalServices) {
    tier = "Standard rate — professional services (no small-company exemption)";
  } else {
    tier = "Standard rate";
  }

  return {
    revenue,
    expenses,
    fixedAssets,
    assessableProfit,
    isSmallCompany,
    citRate,
    cit,
    devLevyRate,
    devLevy,
    totalTax,
    netProfit,
    effectiveRate,
    tier,
  };
}
