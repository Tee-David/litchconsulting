import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  date,
  index,
  jsonb,
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
 * Better Auth User table definition for internal queries & administration.
 * Better Auth created this table with camelCase column names (unlike the
 * snake_case convention used everywhere else) — the mapping must match.
 */
import { boolean } from "drizzle-orm/pg-core";
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  image: text("image"),
  role: text("role").default("client"),
  banned: boolean("banned").default(false),
  createdAt: timestamp("createdAt", { withTimezone: true }),
  updatedAt: timestamp("updatedAt", { withTimezone: true }),
});

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
    requestId: uuid("request_id"), // optional soft ref → service_request.id
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

/**
 * Commercial config per catalog service. Marketing copy (name, tagline,
 * overview, useCases, faqs) stays in `lib/content.ts`, keyed by the same slug;
 * this row carries what the admin edits without a deploy: pricing, required
 * documents, and per-step display overrides. Merged via lib/services/catalog.
 */
export const serviceOffering = pgTable("service_offering", {
  slug: text("slug").primaryKey(), // must match content.ts services[].slug
  active: boolean("active").notNull().default(true),
  pricingMode: text("pricing_mode").notNull().default("quote"), // fixed | quote
  priceNgn: numeric("price_ngn", { precision: 14, scale: 2 }), // VAT-exclusive; null when quote
  taxRate: numeric("tax_rate", { precision: 6, scale: 2 }).notNull().default("7.5"),
  // [{ key, label, description?, required }]
  requiredDocuments: jsonb("required_documents").notNull().default([]),
  // { [status]: { label?, description?, turnaround? } } display overrides
  stepLabels: jsonb("step_labels").notNull().default({}),
  turnaround: text("turnaround"), // headline estimate, e.g. "3–5 business days"
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: updatedAt(),
});

/**
 * A client's service request. The invoice owns the money; the request owns the
 * work. `invoiceId` is the single canonical link (no back-pointer on invoice).
 * Pricing/checklist/step-label fields are SNAPSHOTS taken at submit time so
 * catalog edits never mutate an in-flight request.
 */
export const serviceRequest = pgTable(
  "service_request",
  {
    id: id(),
    number: text("number").notNull().unique(), // REQ-YYYY-NNN
    clientId: uuid("client_id").notNull(), // soft ref → client.id
    userId: text("user_id").notNull(), // Better Auth user.id (ownership checks)
    serviceSlug: text("service_slug").notNull(),
    serviceName: text("service_name").notNull(), // snapshot
    pricingMode: text("pricing_mode").notNull(), // fixed | quote (snapshot)
    priceSnapshot: numeric("price_snapshot", { precision: 14, scale: 2 }),
    currency: text("currency").notNull().default("NGN"),
    // quote_requested | pending_payment | awaiting_documents | in_progress |
    // in_review | delivered | completed | cancelled | declined | refunded
    status: text("status").notNull(),
    details: text("details"), // client brief
    intake: jsonb("intake"), // structured stepper answers
    requiredDocuments: jsonb("required_documents").notNull().default([]), // snapshot
    stepLabels: jsonb("step_labels").notNull().default({}), // snapshot
    invoiceId: uuid("invoice_id"), // soft ref → invoice.id (canonical link)
    assignee: text("assignee"),
    cancelReason: text("cancel_reason"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("service_request_client_idx").on(t.clientId),
    index("service_request_status_idx").on(t.status),
    index("service_request_created_idx").on(t.createdAt),
    index("service_request_invoice_idx").on(t.invoiceId),
  ]
);

/**
 * Timeline entries for a request: the client-visible progress feed AND the
 * internal audit trail, separated by `visibility`.
 */
export const serviceRequestEvent = pgTable(
  "service_request_event",
  {
    id: id(),
    requestId: uuid("request_id").notNull(), // soft ref → service_request.id
    // created | quote_sent | payment_received | status_changed |
    // document_uploaded | documents_complete | deliverable_uploaded | note |
    // ai_analysis_started | ai_analysis_completed | invoice_linked |
    // cancelled | declined | refunded
    type: text("type").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    message: text("message"),
    visibility: text("visibility").notNull().default("client"), // client | internal
    actorRole: text("actor_role").notNull().default("system"), // client | admin | system
    actorName: text("actor_name"),
    createdAt: createdAt(),
  },
  (t) => [
    index("sre_request_idx").on(t.requestId),
    index("sre_created_idx").on(t.createdAt),
  ]
);

/**
 * Files attached to a request: client uploads against the required-documents
 * checklist, and admin deliverables. Stored in the PRIVATE R2 bucket only —
 * access is via ownership-checked presigned GETs, never public URLs.
 * Re-uploads supersede (history kept; newest = current).
 */
export const serviceRequestDocument = pgTable(
  "service_request_document",
  {
    id: id(),
    requestId: uuid("request_id").notNull(), // soft ref → service_request.id
    kind: text("kind").notNull().default("client_upload"), // client_upload | deliverable
    checklistKey: text("checklist_key"), // required-doc slot; null = extra/deliverable
    fileName: text("file_name").notNull(),
    contentType: text("content_type"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    r2Key: text("r2_key").notNull(), // PRIVATE bucket key
    scanStatus: text("scan_status").notNull().default("unscanned"), // unscanned | clean | infected
    uploadedByRole: text("uploaded_by_role").notNull().default("client"), // client | admin
    uploadedByName: text("uploaded_by_name"),
    supersededById: uuid("superseded_by_id"), // newer version of this doc
    litchaiDocumentId: text("litchai_document_id"),
    litchaiStatus: text("litchai_status"), // queued | processing | ready | failed | published
    // for deliverables published from the AI Studio: verified | manual_override
    publishVariant: text("publish_variant"),
    createdAt: createdAt(),
  },
  (t) => [
    index("srd_request_idx").on(t.requestId),
    index("srd_litchai_idx").on(t.litchaiDocumentId),
  ]
);

/**
 * Paystack transactions. One row per checkout attempt; `reference` is OURS
 * (unique, sent to Paystack) so idempotency never depends on Paystack ids.
 * The invoice is the money source of truth — this is the provider ledger.
 */
export const payment = pgTable(
  "payment",
  {
    id: id(),
    reference: text("reference").notNull().unique(), // LC-{invNumber}-{6hex}
    provider: text("provider").notNull().default("paystack"),
    invoiceId: uuid("invoice_id").notNull(), // soft ref → invoice.id
    requestId: uuid("request_id"), // soft ref → service_request.id
    clientId: uuid("client_id"), // soft ref → client.id
    // initialized | success | failed | abandoned | flagged_amount_mismatch | duplicate_success
    status: text("status").notNull().default("initialized"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(), // Naira requested
    amountSettled: numeric("amount_settled", { precision: 14, scale: 2 }), // Paystack kobo/100
    currency: text("currency").notNull().default("NGN"),
    channel: text("channel"), // card | bank | ussd | bank_transfer …
    paystackId: text("paystack_id"), // Paystack numeric transaction id
    accessCode: text("access_code"),
    authorizationUrl: text("authorization_url"), // resume-payment target
    rawEvent: jsonb("raw_event"), // last webhook/verify payload
    paidAt: timestamp("paid_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("payment_invoice_idx").on(t.invoiceId),
    index("payment_status_idx").on(t.status),
    index("payment_created_idx").on(t.createdAt),
  ]
);

/**
 * Consultation bookings mirrored from Cal.com via webhook. The Cal.com booking
 * uid is the idempotency key; reschedules/cancellations update in place.
 */
export const consultation = pgTable(
  "consultation",
  {
    id: id(),
    calBookingUid: text("cal_booking_uid").notNull().unique(),
    name: text("name"),
    email: text("email").notNull(),
    clientId: uuid("client_id"), // matched by email when possible
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    status: text("status").notNull().default("confirmed"), // confirmed | rescheduled | cancelled
    meetingUrl: text("meeting_url"),
    notes: jsonb("notes"), // Cal.com responses payload
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("consultation_starts_idx").on(t.startsAt)]
);

/** Web-push subscriptions (admin alerting in v1). One row per browser. */
export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: id(),
    userId: text("user_id").notNull(), // Better Auth user.id
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("push_subscription_user_idx").on(t.userId)]
);

export type Client = typeof client.$inferSelect;
export type Invoice = typeof invoice.$inferSelect;
export type InvoiceItem = typeof invoiceItem.$inferSelect;
export type Expense = typeof expense.$inferSelect;
export type Post = typeof post.$inferSelect;
export type Template = typeof template.$inferSelect;
export type Ticket = typeof ticket.$inferSelect;
export type TicketMessage = typeof ticketMessage.$inferSelect;
export type OrgSettings = typeof orgSettings.$inferSelect;
export type User = typeof user.$inferSelect;
export type ServiceOffering = typeof serviceOffering.$inferSelect;
export type ServiceRequest = typeof serviceRequest.$inferSelect;
export type ServiceRequestEvent = typeof serviceRequestEvent.$inferSelect;
export type ServiceRequestDocument = typeof serviceRequestDocument.$inferSelect;
export type Payment = typeof payment.$inferSelect;
export type Consultation = typeof consultation.$inferSelect;
export type PushSubscription = typeof pushSubscription.$inferSelect;
