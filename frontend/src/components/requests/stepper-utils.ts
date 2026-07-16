import type { RequiredDocument } from "@/lib/services/catalog";

/** Serializable slice of a catalog service the stepper needs. */
export type StepperService = {
  slug: string;
  name: string;
  tagline: string;
  overview: string;
  deliverables: readonly string[];
  pricingMode: "fixed" | "quote";
  priceNgn: string | null;
  taxRate: string;
  turnaround: string | null;
  requiredDocuments: RequiredDocument[];
};

/** Serializable slice of a CatalogService (safe to pass server → client). */
export function toStepperService(s: StepperService & Record<string, unknown>): StepperService {
  return {
    slug: s.slug,
    name: s.name,
    tagline: s.tagline,
    overview: s.overview,
    deliverables: [...s.deliverables],
    pricingMode: s.pricingMode,
    priceNgn: s.priceNgn,
    taxRate: s.taxRate,
    turnaround: s.turnaround,
    requiredDocuments: s.requiredDocuments,
  };
}
