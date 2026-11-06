import { SettingsView } from "@/components/admin/settings/settings-view";
import { loadSettings } from "./load-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await loadSettings();
  return <SettingsView section="firm" initial={s.initial} placeholders={s.placeholders} currentUser={s.currentUser} />;
}
