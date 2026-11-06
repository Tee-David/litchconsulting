import { SettingsView } from "@/components/admin/settings/settings-view";
import { loadSettings } from "../load-settings";

export const dynamic = "force-dynamic";

/** Every account: ban, unban, delete and role changes (linked from Team and access). */
export default async function UsersSettingsPage() {
  const s = await loadSettings();
  return <SettingsView section="users" initial={s.initial} placeholders={s.placeholders} users={s.users} currentUser={s.currentUser} />;
}
