import { PageHeader } from "@/components/admin/ui/page-header";
import { TemplatesView } from "@/components/admin/templates/templates-view";
import { listTemplates } from "@/lib/db/queries/templates";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const imported = await listTemplates();
  return (
    <div className="space-y-6">
      <PageHeader title="Templates" description="Import, preview, download and reuse branded finance templates." />
      <div data-tour="templates-view">
        <TemplatesView imported={imported} />
      </div>
    </div>
  );
}
