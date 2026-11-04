import { TemplatesView } from "@/components/admin/templates/templates-view";
import { listTemplates } from "@/lib/db/queries/templates";
import { ToolsHead } from "@/components/admin/billing/tools-nav";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const imported = await listTemplates();
  return (
    <div>
      <ToolsHead active="templates" />
      <div data-tour="templates-view">
        <TemplatesView imported={imported} />
      </div>
    </div>
  );
}
