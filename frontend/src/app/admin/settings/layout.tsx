import { Tabs } from "@/components/admin/ui/tabs";

const SETTINGS_TABS = [
  { label: "General", href: "/admin/settings" },
  { label: "Integrations", href: "/admin/settings/integrations" },
];

/**
 * Settings workspace shell. Integrations lives here as a tab rather than a
 * top-level sidebar entry — it's configuration, and the sidebar stays lean.
 * Mirrors the Finance layout's route-based tabs.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div data-tour="settings-tabs">
        <h1 className="mb-4 font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">Settings</h1>
        <Tabs tabs={SETTINGS_TABS} />
      </div>
      {children}
    </div>
  );
}
