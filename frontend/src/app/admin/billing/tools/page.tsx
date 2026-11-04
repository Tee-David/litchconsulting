import { ModelTool } from "@/components/admin/finance/model-tool";
import { ModelPortfolios } from "@/components/admin/finance/model-portfolios";
import { ToolsHead } from "@/components/admin/billing/tools-nav";

export const dynamic = "force-dynamic";

/** Billing → Tools → Financial models: NPV/IRR grid, CSV import, reference portfolios. */
export default function ToolsModelsPage() {
  return (
    <div>
      <ToolsHead active="models" />
      <div className="space-y-6">
        <ModelTool />
        <ModelPortfolios />
      </div>
    </div>
  );
}
