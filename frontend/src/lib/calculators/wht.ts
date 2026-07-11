/**
 * Withholding Tax (WHT) — Nigeria rates by transaction type.
 * Rates come from lib/tax/nigeria-tax-config.json (2024 WHT Regulations / NTA 2025).
 */
import taxConfig from "@/lib/tax/nigeria-tax-config.json";

export type WhtCategory =
  | "dividend"
  | "interest"
  | "rent"
  | "royalty"
  | "commission"
  | "consultancy"
  | "construction"
  | "supply"
  | "technical";

const cfg = taxConfig.wht.rates;
const entry = (v: { label: string; corporatePct: number; individualPct: number }) => ({
  label: v.label,
  corporate: v.corporatePct,
  individual: v.individualPct,
});

export const WHT_RATES: Record<WhtCategory, { label: string; corporate: number; individual: number }> = {
  dividend: entry(cfg.dividend),
  interest: entry(cfg.interest),
  rent: entry(cfg.rent),
  royalty: entry(cfg.royalty),
  commission: entry(cfg.commission),
  consultancy: entry(cfg.consultancy),
  construction: entry(cfg.construction),
  supply: entry(cfg.supply),
  technical: entry(cfg.technical),
};

export interface WhtInput {
  amount: number;
  category: WhtCategory;
  entityType: "corporate" | "individual";
}

export interface WhtResult {
  gross: number;
  wht: number;
  net: number;
  ratePct: number;
  categoryLabel: string;
}

export function computeWht(input: WhtInput): WhtResult {
  const amount = Math.max(0, input.amount || 0);
  const rate = WHT_RATES[input.category];
  const pct = input.entityType === "corporate" ? rate.corporate : rate.individual;
  const wht = amount * (pct / 100);
  return { gross: amount, wht, net: amount - wht, ratePct: pct, categoryLabel: rate.label };
}
