import { PageHeader } from "@/components/admin/ui/page-header";
import { ModelTool } from "@/components/admin/finance/model-tool";
import { ModelPortfolios } from "@/components/admin/finance/model-portfolios";

export const dynamic = "force-dynamic";

/**
 * Finance → Models: interactive financial-model workbench (NPV/IRR grid,
 * CSV import) + sample model portfolios. Previously the "Models" tab had no
 * page and 404'd.
 */
export default function FinanceModelsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial models"
        description="Build quick models — NPV/IRR, cash-flow projections, sensitivity — and explore reference portfolios. Import a CSV or start from scratch."
      />
      <ModelTool />
      <ModelPortfolios />
    </div>
  );
}
