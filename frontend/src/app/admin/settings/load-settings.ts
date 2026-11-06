import "server-only";
import { getOrgSettings } from "@/lib/invoice/get-issuer";
import { issuer as defaultIssuer, DEFAULT_TERMS } from "@/lib/invoice/issuer";
import type { OrgSettingsInput } from "@/app/admin/settings/actions";
import { db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/server-user";
import { desc } from "drizzle-orm";


/** Shared loader for the Firm details, Billing and tax, and Users pages. */
export async function loadSettings() {
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

  return { initial, placeholders, users, currentUser };
}

