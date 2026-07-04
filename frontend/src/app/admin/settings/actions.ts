"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orgSettings } from "@/lib/db/schema";
import { isAdmin } from "@/lib/server-user";

type ActionResult = { ok: boolean; error?: string };

export type OrgSettingsInput = {
  companyName?: string;
  logoUrl?: string;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  invoiceFromEmail?: string;
  defaultCurrency?: string;
  invoiceTerms?: string;
};

const clean = (v?: string) => (v && v.trim() ? v.trim() : null);

/** Upsert the singleton org settings row (id="default"). */
export async function saveOrgSettingsAction(input: OrgSettingsInput): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };

  const fields = {
    companyName: clean(input.companyName),
    logoUrl: clean(input.logoUrl),
    bankName: clean(input.bankName),
    accountName: clean(input.accountName),
    accountNumber: clean(input.accountNumber),
    invoiceFromEmail: clean(input.invoiceFromEmail),
    defaultCurrency: clean(input.defaultCurrency),
    invoiceTerms: clean(input.invoiceTerms),
    updatedAt: new Date(),
  };

  const [existing] = await db.select({ id: orgSettings.id }).from(orgSettings).where(eq(orgSettings.id, "default")).limit(1);
  if (existing) {
    await db.update(orgSettings).set(fields).where(eq(orgSettings.id, "default"));
  } else {
    await db.insert(orgSettings).values({ id: "default", ...fields });
  }

  // Issuer/bank details flow into every invoice, quote and receipt.
  revalidatePath("/admin/settings");
  revalidatePath("/admin/finance/invoices");
  revalidatePath("/admin/finance/quotes");
  revalidatePath("/admin/finance/receipts");
  return { ok: true };
}
