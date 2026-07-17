import { PageHeader } from "@/components/admin/ui/page-header";
import { getOrgSettings } from "@/lib/invoice/get-issuer";
import { issuer as defaultIssuer, DEFAULT_TERMS } from "@/lib/invoice/issuer";
import { SettingsView } from "@/components/admin/settings/settings-view";
import { BackupsCard, type BackupItem } from "@/app/admin/settings/backups-card";
import type { OrgSettingsInput } from "@/app/admin/settings/actions";
import { db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/server-user";
import { listPrivateObjects, r2PrivateConfigured } from "@/lib/r2";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [row, users, currentUser, backupObjects] = await Promise.all([
    getOrgSettings(),
    db.select().from(user).orderBy(desc(user.createdAt)),
    getSessionUser(),
    r2PrivateConfigured
      ? listPrivateObjects("backups/db/").catch(() => [])
      : Promise.resolve([]),
  ]);

  // Newest first, capped for the card.
  const backups: BackupItem[] = [...backupObjects]
    .sort((a, b) => (b.lastModified || "").localeCompare(a.lastModified || ""))
    .slice(0, 20)
    .map((o) => ({ key: o.key, size: o.size, lastModified: o.lastModified }));

  const initial: OrgSettingsInput = {
    companyName: row?.companyName || "",
    logoUrl: row?.logoUrl || "",
    bankName: row?.bankName || "",
    accountName: row?.accountName || "",
    accountNumber: row?.accountNumber || "",
    invoiceFromEmail: row?.invoiceFromEmail || "",
    defaultCurrency: row?.defaultCurrency || "NGN",
    invoiceTerms: row?.invoiceTerms || "",
  };

  const placeholders = {
    companyName: defaultIssuer.name,
    email: defaultIssuer.email,
    bankName: defaultIssuer.bank.name,
    accountName: defaultIssuer.bank.accountName,
    accountNumber: defaultIssuer.bank.accountNumber,
    terms: DEFAULT_TERMS,
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Organisation profile, branding, invoice defaults, and administrative user access control." />
      <SettingsView
        initial={initial}
        placeholders={placeholders}
        users={users}
        currentUser={currentUser}
      />
      <BackupsCard backups={backups} configured={r2PrivateConfigured} />
    </div>
  );
}
