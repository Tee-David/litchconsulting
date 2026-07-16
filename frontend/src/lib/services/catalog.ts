import "server-only";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { serviceOffering, type ServiceOffering } from "@/lib/db/schema";
import { services } from "@/lib/content";

/**
 * The service catalog = marketing copy (lib/content.ts, versioned in git,
 * SEO-rendered) merged with commercial config (service_offering table,
 * admin-editable without a deploy), joined by slug.
 *
 * This module is the single source for: the public request stepper, the
 * "Request this service" buttons, the Get Started grid, and the client
 * dashboard service cards. A DB row without a matching content slug is
 * ignored; a content service without a row falls back to quote-mode.
 */

export type RequiredDocument = {
  key: string;
  label: string;
  description?: string;
  required: boolean;
};

type ContentService = (typeof services)[number];

export type CatalogService = ContentService & {
  active: boolean;
  pricingMode: "fixed" | "quote";
  /** VAT-exclusive Naira price as a numeric string, null for quote-based. */
  priceNgn: string | null;
  taxRate: string;
  requiredDocuments: RequiredDocument[];
  stepLabels: Record<string, { label?: string; description?: string; turnaround?: string }>;
  turnaround: string | null;
  sortOrder: number;
};

const QUOTE_FALLBACK: Pick<
  CatalogService,
  "active" | "pricingMode" | "priceNgn" | "taxRate" | "requiredDocuments" | "stepLabels" | "turnaround" | "sortOrder"
> = {
  active: true,
  pricingMode: "quote",
  priceNgn: null,
  taxRate: "7.5",
  requiredDocuments: [],
  stepLabels: {},
  turnaround: null,
  sortOrder: 99,
};

function merge(content: ContentService, offering?: ServiceOffering): CatalogService {
  if (!offering) return { ...content, ...QUOTE_FALLBACK };
  return {
    ...content,
    active: offering.active,
    pricingMode: offering.pricingMode === "fixed" ? "fixed" : "quote",
    priceNgn: offering.priceNgn,
    taxRate: offering.taxRate,
    requiredDocuments: (offering.requiredDocuments as RequiredDocument[]) ?? [],
    stepLabels: (offering.stepLabels as CatalogService["stepLabels"]) ?? {},
    turnaround: offering.turnaround,
    sortOrder: offering.sortOrder,
  };
}

/** Full catalog, sorted by admin sort order. Inactive services included only on request. */
export async function getCatalog(opts?: { includeInactive?: boolean }): Promise<CatalogService[]> {
  const rows = await db.select().from(serviceOffering).orderBy(asc(serviceOffering.sortOrder));
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const merged = services.map((s) => merge(s, bySlug.get(s.slug)));
  merged.sort((a, b) => a.sortOrder - b.sortOrder);
  return opts?.includeInactive ? merged : merged.filter((s) => s.active);
}

export async function getCatalogService(slug: string): Promise<CatalogService | null> {
  const content = services.find((s) => s.slug === slug);
  if (!content) return null;
  const all = await getCatalog({ includeInactive: true });
  return all.find((s) => s.slug === slug) ?? null;
}
