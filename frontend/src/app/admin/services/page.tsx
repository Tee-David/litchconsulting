import { PageHeader } from "@/components/admin/ui/page-header";
import { getCatalog } from "@/lib/services/catalog";
import { ServicesEditor } from "./services-editor";

export const dynamic = "force-dynamic";

/**
 * Commercial config for the service catalog: pricing mode, price, VAT rate,
 * turnaround copy, and the required-documents checklist per service.
 * Marketing copy lives in code (lib/content.ts); changes here go live
 * immediately for NEW requests only — in-flight requests keep their snapshots.
 */
export default async function AdminServicesPage() {
  const catalog = await getCatalog({ includeInactive: true });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Service catalog"
        description="Pricing, turnaround and required documents per service. In-flight requests are never affected."
      />
      <div data-tour="services-editor">
        <ServicesEditor
          offerings={catalog.map((s) => ({
            slug: s.slug,
            name: s.name,
            tagline: s.tagline,
            active: s.active,
            pricingMode: s.pricingMode,
            priceNgn: s.priceNgn,
            taxRate: s.taxRate,
            turnaround: s.turnaround,
            requiredDocuments: s.requiredDocuments,
            sortOrder: s.sortOrder,
          }))}
        />
      </div>
    </div>
  );
}
