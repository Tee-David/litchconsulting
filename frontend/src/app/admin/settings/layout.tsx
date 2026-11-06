import { requireArea } from "@/lib/server-user";
import { PageHead } from "@/components/admin/ui/surface";
import { SettingsNav } from "@/components/admin/settings/settings-nav";

export const dynamic = "force-dynamic";

/**
 * Settings: a section menu on the left and the section on the right. Each
 * section has its own URL. Changes to firm and billing details collect in the
 * save bar at the bottom.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireArea("settings", "/admin/settings");
  return (
    <div>
      <PageHead title="Settings" lede="How the firm and the platform run. Changes collect in the bar at the bottom." />
      <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
        <div data-tour="settings-tabs" className="md:sticky md:top-20 md:self-start">
          <SettingsNav />
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
