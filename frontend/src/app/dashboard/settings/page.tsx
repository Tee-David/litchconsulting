import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHead, Panel, linkBtn } from "@/components/dashboard/ui";
import { getPortal } from "@/lib/requests/portal";
import { SettingsForm } from "./settings-form";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clientMember, user as userTable } from "@/lib/db/schema";
import { ColleaguesPanel, type Colleague } from "@/components/access/colleagues-panel";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function ClientSettingsPage() {
  const portal = await getPortal();
  if (!portal) redirect("/login?redirect=/dashboard/settings");
  const { user, client } = portal;

  // The people at this business who use the portal: the owner and invited colleagues.
  const members = await db
    .select({ id: userTable.id, name: userTable.name, email: userTable.email, access: clientMember.access })
    .from(clientMember)
    .innerJoin(userTable, eq(userTable.id, clientMember.userId))
    .where(eq(clientMember.clientId, client.id))
    .catch(() => []);
  const owner = client.userId
    ? (await db.select({ id: userTable.id, name: userTable.name, email: userTable.email }).from(userTable).where(eq(userTable.id, client.userId)).limit(1).catch(() => []))[0]
    : undefined;
  const people: Colleague[] = [
    ...(owner ? [{ ...owner, access: "owner", you: owner.id === user.id }] : []),
    ...members.filter((m) => m.id !== owner?.id).map((m) => ({ ...m, you: m.id === user.id })),
  ];

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
          <Panel title="People at your business">
            <ColleaguesPanel people={people} />
          </Panel>
          <Panel title="Sign-in and security">
            <p className="text-sm text-body">Signed in as <b className="text-ink">{user.email}</b>. Change your password, turn on two-step sign-in, and see the devices signed in as you.</p>
            <Link href="/account/security" className={`${linkBtn.small} mt-3`}>Profile and security</Link>
          </Panel>
          <Panel title="Your data">
            <p className="text-sm text-body">Download everything we hold about your business as one file, with links to your documents. To delete your account, ask us: tax records are kept for 6 years by law.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href="/dashboard/settings/export" className={linkBtn.small} download>
                Download my data
              </a>
              <Link href="/dashboard/support?new=true" className={linkBtn.small}>Ask to delete</Link>
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
