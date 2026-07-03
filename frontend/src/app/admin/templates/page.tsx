import { PageHeader } from "@/components/admin/ui/page-header";
import { TemplatesView } from "@/components/admin/templates/templates-view";

export default function TemplatesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Templates" description="Preview, download and reuse branded finance templates." />
      <TemplatesView />
    </div>
  );
}
