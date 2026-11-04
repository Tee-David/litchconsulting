import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHead, Panel, linkBtn } from "@/components/dashboard/ui";
import { getPortal } from "@/lib/requests/portal";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function ClientSettingsPage() {
  const portal = await getPortal();
  if (!portal) redirect("/login?redirect=/dashboard/settings");
  const { user, client } = portal;

  return (
    <div>
      <PageHead title="Settings" lede="You and your company. These details go on your quotes and invoices." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <SettingsForm
          initialData={{
            name: client.name,
            company: client.company,
            phone: client.phone,
            address: client.address,
            taxId: client.taxId,
            email: user.email || "",
            digestOptOut: client.digestOptOut,
          }}
        />
        <aside className="space-y-6">
          <Panel title="Notifications">
            <p className="text-sm text-body">Choose how you hear about quotes, drafts, payments and replies, and turn on push for this device.</p>
            <Link href="/dashboard/notifications?tab=prefs" className={`${linkBtn.small} mt-3`}>Notification preferences</Link>
          </Panel>
          <Panel title="Sign-in">
            <p className="text-sm text-body">Signed in as <b className="text-ink">{user.email}</b>. To change your password, sign out and use &ldquo;Forgot password&rdquo; on the sign-in page.</p>
          </Panel>
          <Panel title="Your data">
            <p className="text-sm text-body">Ask for a copy of everything we hold about you, or for your account to be deleted. Tax records are kept for 6 years by law.</p>
            <Link href="/dashboard/support?new=true" className={`${linkBtn.small} mt-3`}>Ask us</Link>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
