import { requireArea } from "@/lib/server-user";
import { PageHead } from "@/components/admin/ui/surface";
import { SettingsNav } from "@/components/admin/settings/settings-nav";

export const dynamic = "force-dynamic";

/**
 * Settings: firm details and users, team and access (owned by the access
 * page), notifications, backups with a restore test, and integrations with
 * live health. Each section has its own URL.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireArea("settings", "/admin/settings");
  return (
    <div>
      <PageHead title="Settings" lede="How the firm and the platform run." />
      <div data-tour="settings-tabs">
        <SettingsNav />
      </div>
      {children}
    </div>
  );
}
