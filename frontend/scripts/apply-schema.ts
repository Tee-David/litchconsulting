import { Pool } from "pg";

function ssl() {
  const cert = process.env.COCKROACH_CA_CERT || process.env.COCKROACHDB_CERT;
  return cert && cert.includes("BEGIN CERTIFICATE")
    ? { ca: cert, rejectUnauthorized: true as const }
    : { rejectUnauthorized: true as const };
}

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "client" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text, "name" text NOT NULL, "company" text, "email" text,
    "phone" text, "address" text, "tax_id" text, "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "invoice" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "number" text NOT NULL, "status" text DEFAULT 'draft' NOT NULL, "client_id" uuid,
    "bill_to_name" text, "bill_to_company" text, "bill_to_email" text,
    "bill_to_address" text, "bill_to_tax_id" text, "project_title" text,
    "currency" text DEFAULT 'NGN' NOT NULL, "issue_date" date NOT NULL, "due_date" date,
    "notes" text, "terms" text, "payment_url" text, "public_token" text NOT NULL,
    "subtotal" numeric(14, 2) DEFAULT '0' NOT NULL, "tax_total" numeric(14, 2) DEFAULT '0' NOT NULL,
    "total" numeric(14, 2) DEFAULT '0' NOT NULL, "amount_paid" numeric(14, 2) DEFAULT '0' NOT NULL,
    "created_by_user_id" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "sent_at" timestamp with time zone, "paid_at" timestamp with time zone,
    CONSTRAINT "invoice_number_unique" UNIQUE("number"),
    CONSTRAINT "invoice_public_token_unique" UNIQUE("public_token"))`,
  `CREATE TABLE IF NOT EXISTS "invoice_item" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "invoice_id" uuid NOT NULL, "description" text NOT NULL, "detail" text,
    "quantity" numeric(12, 2) DEFAULT '1' NOT NULL, "unit_price" numeric(14, 2) DEFAULT '0' NOT NULL,
    "tax_rate" numeric(6, 2) DEFAULT '0' NOT NULL, "amount" numeric(14, 2) DEFAULT '0' NOT NULL,
    "position" integer DEFAULT 0 NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "client_email_idx" ON "client" ("email")`,
  `CREATE INDEX IF NOT EXISTS "invoice_status_idx" ON "invoice" ("status")`,
  `CREATE INDEX IF NOT EXISTS "invoice_client_idx" ON "invoice" ("client_id")`,
  `CREATE INDEX IF NOT EXISTS "invoice_created_idx" ON "invoice" ("created_at")`,
  `CREATE INDEX IF NOT EXISTS "invoice_item_invoice_idx" ON "invoice_item" ("invoice_id")`,
  `ALTER TABLE "invoice" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'invoice'`,
  `CREATE INDEX IF NOT EXISTS "invoice_kind_idx" ON "invoice" ("kind")`,
  `CREATE TABLE IF NOT EXISTS "expense" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "date" date NOT NULL, "category" text DEFAULT 'other' NOT NULL,
    "vendor" text, "description" text,
    "amount" numeric(14, 2) DEFAULT '0' NOT NULL, "currency" text DEFAULT 'NGN' NOT NULL,
    "method" text, "reference" text, "created_by_user_id" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "expense_date_idx" ON "expense" ("date")`,
  `CREATE INDEX IF NOT EXISTS "expense_category_idx" ON "expense" ("category")`,
  `CREATE TABLE IF NOT EXISTS "post" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "slug" text NOT NULL, "title" text NOT NULL, "tag" text DEFAULT 'Insights' NOT NULL,
    "excerpt" text, "cover_image" text, "author" text DEFAULT 'Litch Consulting' NOT NULL,
    "body" text DEFAULT '' NOT NULL, "status" text DEFAULT 'draft' NOT NULL,
    "seo_title" text, "seo_description" text, "read_mins" integer DEFAULT 1 NOT NULL,
    "created_by_user_id" text, "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "post_slug_unique" UNIQUE("slug"))`,
  `CREATE INDEX IF NOT EXISTS "post_status_idx" ON "post" ("status")`,
  `CREATE INDEX IF NOT EXISTS "post_published_idx" ON "post" ("published_at")`,
  `CREATE TABLE IF NOT EXISTS "ticket" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "number" text NOT NULL, "subject" text NOT NULL,
    "requester_name" text, "requester_email" text, "client_id" uuid,
    "status" text DEFAULT 'open' NOT NULL, "priority" text DEFAULT 'normal' NOT NULL,
    "category" text DEFAULT 'general' NOT NULL, "assignee" text, "created_by_user_id" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "last_reply_at" timestamp with time zone,
    CONSTRAINT "ticket_number_unique" UNIQUE("number"))`,
  `CREATE INDEX IF NOT EXISTS "ticket_status_idx" ON "ticket" ("status")`,
  `CREATE INDEX IF NOT EXISTS "ticket_created_idx" ON "ticket" ("created_at")`,
  `CREATE TABLE IF NOT EXISTS "ticket_message" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "ticket_id" uuid NOT NULL, "author_name" text,
    "author_role" text DEFAULT 'agent' NOT NULL, "body" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "ticket_message_ticket_idx" ON "ticket_message" ("ticket_id")`,
  `CREATE TABLE IF NOT EXISTS "template" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "title" text NOT NULL, "description" text, "category" text DEFAULT 'General' NOT NULL,
    "file_type" text DEFAULT 'PDF' NOT NULL, "file_url" text NOT NULL, "file_key" text,
    "size_bytes" integer DEFAULT 0 NOT NULL, "badge" text, "uploaded_by_user_id" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "template_category_idx" ON "template" ("category")`,
  `CREATE INDEX IF NOT EXISTS "template_created_idx" ON "template" ("created_at")`,
  `CREATE TABLE IF NOT EXISTS "org_settings" (
    "id" text PRIMARY KEY,
    "company_name" text, "logo_url" text,
    "bank_name" text, "account_name" text, "account_number" text,
    "invoice_from_email" text, "default_currency" text, "invoice_terms" text,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  // ---- Service requests / Paystack / consultations / push (funnel phase) ----
  `CREATE TABLE IF NOT EXISTS "service_offering" (
    "slug" text PRIMARY KEY,
    "active" boolean DEFAULT true NOT NULL,
    "pricing_mode" text DEFAULT 'quote' NOT NULL,
    "price_ngn" numeric(14, 2),
    "tax_rate" numeric(6, 2) DEFAULT '7.5' NOT NULL,
    "required_documents" jsonb DEFAULT '[]' NOT NULL,
    "step_labels" jsonb DEFAULT '{}' NOT NULL,
    "turnaround" text,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "service_request" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "number" text NOT NULL, "client_id" uuid NOT NULL, "user_id" text NOT NULL,
    "service_slug" text NOT NULL, "service_name" text NOT NULL,
    "pricing_mode" text NOT NULL, "price_snapshot" numeric(14, 2),
    "currency" text DEFAULT 'NGN' NOT NULL, "status" text NOT NULL,
    "details" text, "intake" jsonb,
    "required_documents" jsonb DEFAULT '[]' NOT NULL,
    "step_labels" jsonb DEFAULT '{}' NOT NULL,
    "invoice_id" uuid, "assignee" text, "cancel_reason" text,
    "delivered_at" timestamp with time zone, "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "service_request_number_unique" UNIQUE("number"))`,
  `CREATE INDEX IF NOT EXISTS "service_request_client_idx" ON "service_request" ("client_id")`,
  `CREATE INDEX IF NOT EXISTS "service_request_status_idx" ON "service_request" ("status")`,
  `CREATE INDEX IF NOT EXISTS "service_request_created_idx" ON "service_request" ("created_at")`,
  `CREATE INDEX IF NOT EXISTS "service_request_invoice_idx" ON "service_request" ("invoice_id")`,
  `CREATE TABLE IF NOT EXISTS "service_request_event" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "request_id" uuid NOT NULL, "type" text NOT NULL,
    "from_status" text, "to_status" text, "message" text,
    "visibility" text DEFAULT 'client' NOT NULL,
    "actor_role" text DEFAULT 'system' NOT NULL, "actor_name" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "sre_request_idx" ON "service_request_event" ("request_id")`,
  `CREATE INDEX IF NOT EXISTS "sre_created_idx" ON "service_request_event" ("created_at")`,
  `CREATE TABLE IF NOT EXISTS "service_request_document" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "request_id" uuid NOT NULL, "kind" text DEFAULT 'client_upload' NOT NULL,
    "checklist_key" text, "file_name" text NOT NULL, "content_type" text,
    "size_bytes" integer DEFAULT 0 NOT NULL, "r2_key" text NOT NULL,
    "scan_status" text DEFAULT 'unscanned' NOT NULL,
    "uploaded_by_role" text DEFAULT 'client' NOT NULL, "uploaded_by_name" text,
    "superseded_by_id" uuid, "litchai_document_id" text, "litchai_status" text,
    "publish_variant" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "srd_request_idx" ON "service_request_document" ("request_id")`,
  `CREATE INDEX IF NOT EXISTS "srd_litchai_idx" ON "service_request_document" ("litchai_document_id")`,
  `CREATE TABLE IF NOT EXISTS "payment" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "reference" text NOT NULL, "provider" text DEFAULT 'paystack' NOT NULL,
    "invoice_id" uuid NOT NULL, "request_id" uuid, "client_id" uuid,
    "status" text DEFAULT 'initialized' NOT NULL,
    "amount" numeric(14, 2) NOT NULL, "amount_settled" numeric(14, 2),
    "currency" text DEFAULT 'NGN' NOT NULL, "channel" text,
    "paystack_id" text, "access_code" text, "authorization_url" text,
    "raw_event" jsonb, "paid_at" timestamp with time zone,
    "verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "payment_reference_unique" UNIQUE("reference"))`,
  `CREATE INDEX IF NOT EXISTS "payment_invoice_idx" ON "payment" ("invoice_id")`,
  `CREATE INDEX IF NOT EXISTS "payment_status_idx" ON "payment" ("status")`,
  `CREATE INDEX IF NOT EXISTS "payment_created_idx" ON "payment" ("created_at")`,
  `CREATE TABLE IF NOT EXISTS "consultation" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "cal_booking_uid" text NOT NULL, "name" text, "email" text NOT NULL,
    "client_id" uuid, "starts_at" timestamp with time zone, "ends_at" timestamp with time zone,
    "status" text DEFAULT 'confirmed' NOT NULL, "meeting_url" text, "notes" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "consultation_cal_booking_uid_unique" UNIQUE("cal_booking_uid"))`,
  `CREATE INDEX IF NOT EXISTS "consultation_starts_idx" ON "consultation" ("starts_at")`,
  `CREATE TABLE IF NOT EXISTS "push_subscription" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL, "endpoint" text NOT NULL,
    "p256dh" text NOT NULL, "auth" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "push_subscription_endpoint_unique" UNIQUE("endpoint"))`,
  `CREATE INDEX IF NOT EXISTS "push_subscription_user_idx" ON "push_subscription" ("user_id")`,
  `ALTER TABLE "ticket" ADD COLUMN IF NOT EXISTS "request_id" uuid`,
  // ---- Client profile hub (notes/tasks + per-client query indexes) ----
  `CREATE TABLE IF NOT EXISTS "client_note" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "client_id" uuid NOT NULL,
    "author_name" text,
    "kind" text DEFAULT 'note' NOT NULL,
    "body" text NOT NULL,
    "done" boolean DEFAULT false NOT NULL,
    "due_date" date,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "client_note_client_idx" ON "client_note" ("client_id", "kind", "done")`,
  `CREATE INDEX IF NOT EXISTS "payment_client_idx" ON "payment" ("client_id")`,
  `CREATE INDEX IF NOT EXISTS "ticket_client_idx" ON "ticket" ("client_id")`,
  `CREATE INDEX IF NOT EXISTS "consultation_client_idx" ON "consultation" ("client_id")`,
  `CREATE INDEX IF NOT EXISTS "consultation_email_idx" ON "consultation" ("email")`,
];

/**
 * Idempotent seed: one service_offering row per content.ts service slug.
 * All start as quote-mode with placeholder turnarounds; admin edits from
 * /admin/services. ON CONFLICT DO NOTHING so re-runs never clobber edits.
 */
const OFFERING_SEED: Array<[slug: string, sortOrder: number, turnaround: string]> = [
  ["financial-reporting", 1, "3–5 business days"],
  ["financial-modelling", 2, "5–10 business days"],
  ["taxation-planning-management", 3, "5–10 business days"],
  ["forensic-accounting", 4, "Scoped in your quote"],
  ["data-analytics", 5, "5–10 business days"],
  ["general-advisory", 6, "Scoped in your quote"],
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.COCKROACHDB_URL, ssl: ssl() });
  for (const sql of STATEMENTS) {
    await pool.query(sql);
    console.log("✓", sql.split("\n")[0].trim().slice(0, 60));
  }
  for (const [slug, sortOrder, turnaround] of OFFERING_SEED) {
    await pool.query(
      `INSERT INTO "service_offering" ("slug", "sort_order", "turnaround")
       VALUES ($1, $2, $3) ON CONFLICT ("slug") DO NOTHING`,
      [slug, sortOrder, turnaround]
    );
  }
  console.log("✓ service_offering seed (6 slugs, ON CONFLICT DO NOTHING)");
  for (const t of ["client", "invoice", "invoice_item", "service_offering", "service_request", "payment"]) {
    const r = await pool.query(`SELECT count(*)::int AS n FROM "${t}"`);
    console.log(`  ${t}: ${r.rows[0].n} rows`);
  }
  await pool.end();
  console.log("Done.");
  process.exit(0);
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
