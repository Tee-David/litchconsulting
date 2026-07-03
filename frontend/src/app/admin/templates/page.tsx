import { FileStack } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { EmptyState } from "@/components/admin/ui/empty-state";

export default function TemplatesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Templates" description="Downloadable resources for your clients — budgeting sheets, checklists and models." />
      <EmptyState
        icon={FileStack}
        title="Template library is on the way"
        description="Upload branded templates to R2 and share them with clients. Wired to the existing upload pipeline next."
      />
    </div>
  );
}
