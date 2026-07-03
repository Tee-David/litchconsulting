import { Settings2 } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { EmptyState } from "@/components/admin/ui/empty-state";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Organisation profile, branding, invoice defaults and account preferences." />
      <EmptyState
        icon={Settings2}
        title="Settings are coming next"
        description="Manage your firm details, invoice issuer & bank info, logo and team — the values currently driven by environment config."
      />
    </div>
  );
}
