"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { serviceOffering } from "@/lib/db/schema";
import { isAdmin } from "@/lib/server-user";
import { services } from "@/lib/content";
import type { RequiredDocument } from "@/lib/services/catalog";

type ActionResult = { ok: boolean; error?: string };

/**
 * Upsert the commercial config for one catalog service. Marketing copy stays
 * in lib/content.ts; this only touches pricing/docs/turnaround. Snapshots on
 * existing requests are untouched by design.
 */
export async function saveOfferingAction(input: {
  slug: string;
  active: boolean;
  pricingMode: "fixed" | "quote";
  priceNgn: string | null;
  taxRate: string;
  turnaround: string | null;
  requiredDocuments: RequiredDocument[];
  sortOrder: number;
}): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  if (!services.some((s) => s.slug === input.slug)) {
    return { ok: false, error: "Unknown service slug" };
  }
  if (input.pricingMode === "fixed") {
    const price = Number(input.priceNgn);
    if (!Number.isFinite(price) || price <= 0) {
      return { ok: false, error: "Fixed-price services need a price above zero." };
    }
  }
  const taxRate = Number(input.taxRate);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
    return { ok: false, error: "Tax rate must be between 0 and 100." };
  }
  const docs = (input.requiredDocuments ?? [])
    .filter((d) => d.label?.trim())
    .map((d, i) => ({
      key: d.key?.trim() || `doc-${i + 1}`,
      label: d.label.trim(),
      description: d.description?.trim() || undefined,
      required: Boolean(d.required),
    }));
  // Slot keys must be unique — uploads are matched to slots by key.
  const seen = new Set<string>();
  for (const d of docs) {
    if (seen.has(d.key)) return { ok: false, error: `Duplicate document key "${d.key}".` };
    seen.add(d.key);
  }

  const values = {
    active: input.active,
    pricingMode: input.pricingMode,
    priceNgn: input.pricingMode === "fixed" ? String(Number(input.priceNgn)) : null,
    taxRate: String(taxRate),
    turnaround: input.turnaround?.trim() || null,
    requiredDocuments: docs,
    sortOrder: input.sortOrder,
    updatedAt: new Date(),
  };

  await db
    .insert(serviceOffering)
    .values({ slug: input.slug, ...values })
    .onConflictDoUpdate({ target: serviceOffering.slug, set: values });

  revalidatePath("/admin/services");
  revalidatePath("/get-started");
  revalidatePath("/dashboard/requests/new");
  return { ok: true };
}
