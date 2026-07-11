import { PageHeader } from "@/components/admin/ui/page-header";
import { getOrgSettings } from "@/lib/invoice/get-issuer";
import { issuer as defaultIssuer, DEFAULT_TERMS } from "@/lib/invoice/issuer";
import { SettingsView } from "@/components/admin/settings/settings-view";
import type { OrgSettingsInput } from "@/app/admin/settings/actions";
import { db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/server-user";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [row, users, currentUser] = await Promise.all([
    getOrgSettings(),
    db.select().from(user).orderBy(desc(user.createdAt)),
    getSessionUser(),
  ]);

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
    </div>
  );
}
