import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orgSettings, type OrgSettings } from "@/lib/db/schema";
import { issuer as defaultIssuer, type Issuer } from "./issuer";

/** The singleton org settings row (id="default"), or null. */
export async function getOrgSettings(): Promise<OrgSettings | null> {
  try {
    const [row] = await db.select().from(orgSettings).where(eq(orgSettings.id, "default")).limit(1);
    return row ?? null;
  } catch {
    return null; // table not migrated yet
  }
}

/** Invoice issuer with admin Settings merged over the built-in defaults. */
export async function getIssuer(): Promise<Issuer> {
  const row = await getOrgSettings();
  if (!row) return defaultIssuer;
  return {
    name: row.companyName || defaultIssuer.name,
    email: row.invoiceFromEmail || defaultIssuer.email,
    phone: defaultIssuer.phone,
    address: defaultIssuer.address,
    website: defaultIssuer.website,
    bank: {
      name: row.bankName || defaultIssuer.bank.name,
      accountName: row.accountName || defaultIssuer.bank.accountName,
      accountNumber: row.accountNumber || defaultIssuer.bank.accountNumber,
    },
  };
}
