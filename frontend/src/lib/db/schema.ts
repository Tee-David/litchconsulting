import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  date,
  index,
} from "drizzle-orm/pg-core";

/**
 * Litch app schema (Drizzle) on the SAME CockroachDB that Better Auth uses.
 * Better Auth manages user/session/account/verification via its own CLI
 * migration; tables here reference that auth `user.id` by TEXT id (no hard FK,
 * to avoid touching Better Auth's tables).
 *
 * This file grows per phase:
 *   Phase 5 → client, invoice, invoice_item (admin dashboard + invoicing)
 *   Later   → quote, receipt, template, booking, document …
 */

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

/**
 * CRM leads captured across the site: newsletter signups, email-gated
 * calculator results, template downloads, and contact/booking enquiries.
 */
export const lead = pgTable("lead", {
  id: id(),
  email: text("email").notNull(),
  name: text("name"),
  // newsletter | calculator | template | contact | booking
  source: text("source").notNull().default("newsletter"),
  detail: text("detail"), // e.g. which calculator or template
  createdAt: createdAt(),
});

/**
 * Client / bill-to records. Doubles as the seed for the Clients section and
 * the "Bill to" directory used by the invoice builder. Optionally linked to a
 * Better Auth `user.id` (TEXT) when a client also has a portal login.
 */
export const client = pgTable(
  "client",
  {
    id: id(),
    userId: text("user_id"), // optional link to Better Auth user
    name: text("name").notNull(),
    company: text("company"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    taxId: text("tax_id"), // TIN / RC number
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("client_email_idx").on(t.email)]
);

/**
 * Invoices. Money is stored as numeric(14,2) and always recomputed on the
 * server from the line items. A denormalised bill-to snapshot is kept so a
 * historical invoice never changes if the linked client record is later edited.
 */
export const invoice = pgTable(
  "invoice",
  {
    id: id(),
    number: text("number").notNull().unique(), // INV-YYYY-NNN or QUO-YYYY-NNN
    // invoice | quote — quotes reuse the whole invoice engine
    kind: text("kind").notNull().default("invoice"),
    // invoice: draft|sent|paid|overdue|void · quote: draft|sent|accepted|declined
    status: text("status").notNull().default("draft"),

    clientId: uuid("client_id"), // soft ref → client.id
    // Bill-to snapshot (immutable copy at issue time)
    billToName: text("bill_to_name"),
    billToCompany: text("bill_to_company"),
    billToEmail: text("bill_to_email"),
    billToAddress: text("bill_to_address"),
    billToTaxId: text("bill_to_tax_id"),

    projectTitle: text("project_title"),
    currency: text("currency").notNull().default("NGN"),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date"),

    notes: text("notes"),
    terms: text("terms"),
    paymentUrl: text("payment_url"), // Pay button target (Paystack link later)
    publicToken: text("public_token").notNull().unique(), // /i/[token]

    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
    taxTotal: numeric("tax_total", { precision: 14, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
    amountPaid: numeric("amount_paid", { precision: 14, scale: 2 }).notNull().default("0"),

    createdByUserId: text("created_by_user_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [
    index("invoice_status_idx").on(t.status),
    index("invoice_client_idx").on(t.clientId),
    index("invoice_created_idx").on(t.createdAt),
    index("invoice_kind_idx").on(t.kind),
  ]
);

/** Line items for an invoice. */
export const invoiceItem = pgTable(
  "invoice_item",
  {
    id: id(),
    invoiceId: uuid("invoice_id").notNull(), // soft ref → invoice.id
    description: text("description").notNull(),
    detail: text("detail"),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default("1"),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull().default("0"),
    taxRate: numeric("tax_rate", { precision: 6, scale: 2 }).notNull().default("0"), // percent
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("invoice_item_invoice_idx").on(t.invoiceId)]
);

/**
 * Blog / Insights posts managed from the admin CMS. Published posts merge with
 * the curated static posts on the public /insights pages. Body is stored as
 * plain text (paragraphs separated by blank lines; lightweight markdown).
 */
export const post = pgTable(
  "post",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    tag: text("tag").notNull().default("Insights"),
    excerpt: text("excerpt"),
    coverImage: text("cover_image"),
    author: text("author").notNull().default("Litch Consulting"),
    body: text("body").notNull().default(""),
    status: text("status").notNull().default("draft"), // draft | published
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    readMins: integer("read_mins").notNull().default(1),
    createdByUserId: text("created_by_user_id"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("post_status_idx").on(t.status), index("post_published_idx").on(t.publishedAt)]
);

/**
 * Business expenses ledger. Income for the P&L is derived from collected
 * invoices; this table records the outgoings so Accounting can show a running
 * profit & loss. Money stored as numeric(14,2), one currency per entry.
 */
export const expense = pgTable(
  "expense",
  {
    id: id(),
    date: date("date").notNull(),
    category: text("category").notNull().default("other"),
    vendor: text("vendor"),
    description: text("description"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("NGN"),
    method: text("method"), // cash | transfer | card | cheque
    reference: text("reference"),
    createdByUserId: text("created_by_user_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("expense_date_idx").on(t.date), index("expense_category_idx").on(t.category)]
);

/**
 * Uploaded template library. Admins import branded/working files (XLSX, DOCX,
 * PDF, CSV) to R2; these show alongside the curated starter templates and are
 * really downloadable and shareable.
 */
export const template = pgTable(
  "template",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category").notNull().default("General"),
    fileType: text("file_type").notNull().default("PDF"), // XLSX | DOCX | PDF | CSV | PPTX | ZIP
    fileUrl: text("file_url").notNull(),
    fileKey: text("file_key"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    badge: text("badge"), // Popular | New | null
    uploadedByUserId: text("uploaded_by_user_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("template_category_idx").on(t.category), index("template_created_idx").on(t.createdAt)]
);

/**
 * Support tickets (Help Desk). A ticket has a thread of messages. Requester is
 * captured as a snapshot; optionally linked to a client record.
 */
export const ticket = pgTable(
  "ticket",
  {
    id: id(),
    number: text("number").notNull().unique(), // TKT-NNNN
    subject: text("subject").notNull(),
    requesterName: text("requester_name"),
    requesterEmail: text("requester_email"),
    clientId: uuid("client_id"), // soft ref → client.id
    // open | pending | resolved | closed
    status: text("status").notNull().default("open"),
    // urgent | high | normal | low
    priority: text("priority").notNull().default("normal"),
    category: text("category").notNull().default("general"),
    assignee: text("assignee"),
    createdByUserId: text("created_by_user_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    lastReplyAt: timestamp("last_reply_at", { withTimezone: true }),
  },
  (t) => [index("ticket_status_idx").on(t.status), index("ticket_created_idx").on(t.createdAt)]
);

/** One message in a ticket thread (from the client or an agent). */
export const ticketMessage = pgTable(
  "ticket_message",
  {
    id: id(),
    ticketId: uuid("ticket_id").notNull(), // soft ref → ticket.id
    authorName: text("author_name"),
    authorRole: text("author_role").notNull().default("agent"), // client | agent
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ticket_message_ticket_idx").on(t.ticketId)]
);

/**
 * Singleton org settings (id = "default"). Powers the invoice issuer / bank
 * details shown on invoices & receipts, editable from admin Settings.
 */
export const orgSettings = pgTable("org_settings", {
  id: text("id").primaryKey(), // always "default"
  companyName: text("company_name"),
  logoUrl: text("logo_url"),
  bankName: text("bank_name"),
  accountName: text("account_name"),
  accountNumber: text("account_number"),
  invoiceFromEmail: text("invoice_from_email"),
  defaultCurrency: text("default_currency"),
  invoiceTerms: text("invoice_terms"),
  updatedAt: updatedAt(),
});

export type Client = typeof client.$inferSelect;
export type Invoice = typeof invoice.$inferSelect;
export type InvoiceItem = typeof invoiceItem.$inferSelect;
export type Expense = typeof expense.$inferSelect;
export type Post = typeof post.$inferSelect;
export type Template = typeof template.$inferSelect;
export type Ticket = typeof ticket.$inferSelect;
export type TicketMessage = typeof ticketMessage.$inferSelect;
export type OrgSettings = typeof orgSettings.$inferSelect;
