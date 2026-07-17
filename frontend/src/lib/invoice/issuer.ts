import { site } from "@/lib/content";

/**
 * The invoice "From" party — Litch Consulting. Bank details come from env now
 * (INVOICE_*), editable from admin Settings later. Falls back to sensible
 * defaults so the template always renders.
 */
export const issuer = {
  name: site.legalName,
  email: process.env.INVOICE_FROM_EMAIL || site.email,
  phone: site.phone,
  address: site.location,
  website: "litchconsulting.com",
  bank: {
    name: process.env.INVOICE_BANK_NAME || "—",
    accountName: process.env.INVOICE_ACCOUNT_NAME || site.legalName,
    accountNumber: process.env.INVOICE_ACCOUNT_NUMBER || "—",
  },
  /** Authorised signatory shown on invoices/receipts. The signature image is
   *  the cleaned scan at `public/brand/signature.png`; renderers fall back to
   *  the name alone when it is absent. */
  signatory: {
    name: "A. Saheed",
    signatureImage: "/brand/signature.png",
  },
};

export type Issuer = typeof issuer;

/** Default payment terms line shown on invoices. */
export const DEFAULT_TERMS =
  "Payment is due within 14 days of the issue date. Thank you for your business.";
