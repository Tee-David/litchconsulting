import { SettingsView } from "@/components/admin/settings/settings-view";
import { loadSettings } from "../load-settings";

export const dynamic = "force-dynamic";

/** Billing and tax: bank details on invoices, default currency and terms, tax rates in use. */
export default async function BillingSettingsPage() {
  const s = await loadSettings();
  return <SettingsView section="billing" initial={s.initial} placeholders={s.placeholders} currentUser={s.currentUser} />;
}
