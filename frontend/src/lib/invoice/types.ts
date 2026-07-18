/** Shared invoice shapes used by the builder, HTML preview and PDF renderer. */

export type InvoiceItemData = {
  description: string;
  detail?: string;
  quantity: number;
  unitPrice: number;
  taxRate: number; // percent
};

export type BillTo = {
  name?: string;
  company?: string;
  email?: string;
  address?: string;
  taxId?: string;
};

export type InvoiceData = {
  number: string;
  status: string; // draft | sent | paid | overdue | void
  issueDate: string; // YYYY-MM-DD
  dueDate?: string | null;
  currency: string;
  projectTitle?: string | null;
  billTo: BillTo;
  items: InvoiceItemData[];
  notes?: string | null;
  terms?: string | null;
  paymentUrl?: string | null;
  publicToken?: string | null;
  /** Formatted date the invoice was paid (drives the in-paper PAID banner). */
  paidAt?: string | null;
};

export const INVOICE_STATUSES = ["draft", "sent", "paid", "overdue", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Serializable payload sent from the builder to the save server action. */
export type InvoiceInput = {
  id?: string;
  kind?: "invoice" | "quote";
  number: string;
  status?: string;
  clientId?: string | null;
  billTo: BillTo;
  projectTitle?: string;
  currency: string;
  issueDate: string;
  dueDate?: string;
  notes?: string;
  terms?: string;
  items: InvoiceItemData[];
  /** service_request to auto-link on save (from /admin/requests "Create quote"). */
  requestId?: string;
};

