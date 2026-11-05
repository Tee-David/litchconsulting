import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

export function ssl() {
  // Always verify against the committed CA (operator directive): env cert wins
  // (rotation), else the repo cert file — never bare system CAs.
  const cert = process.env.COCKROACH_CA_CERT || process.env.COCKROACHDB_CERT;
  if (cert && cert.includes("BEGIN CERTIFICATE")) return { ca: cert, rejectUnauthorized: true as const };
  return {
    ca: readFileSync(join(process.cwd(), "certs", "cockroach-ca.crt"), "utf8"),
    rejectUnauthorized: true as const,
  };
}

export const STATEMENTS = [
  // ---- Leads (contact / booking / newsletter / calculators / templates) ----
  `CREATE TABLE IF NOT EXISTS "lead" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "email" text NOT NULL,
    "name" text,
    "source" text DEFAULT 'newsletter' NOT NULL,
    "detail" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL)`,
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
  `CREATE TABLE IF NOT EXISTS "category" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "kind" text NOT NULL, "name" text NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "category_kind_name_idx" ON "category" ("kind", "name")`,
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
  // ---- Soft delete (Trash + 30-day purge) ----
  `ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone`,
  `ALTER TABLE "invoice" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone`,
  `ALTER TABLE "ticket" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone`,
  `ALTER TABLE "service_request" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone`,
  `CREATE INDEX IF NOT EXISTS "client_deleted_idx" ON "client" ("deleted_at")`,
  `CREATE INDEX IF NOT EXISTS "invoice_deleted_idx" ON "invoice" ("deleted_at")`,
  `CREATE INDEX IF NOT EXISTS "ticket_deleted_idx" ON "ticket" ("deleted_at")`,
  `CREATE INDEX IF NOT EXISTS "service_request_deleted_idx" ON "service_request" ("deleted_at")`,
  // ---- Support: 3-pane help-desk fields ----
  `ALTER TABLE "ticket" ADD COLUMN IF NOT EXISTS "team" text`,
  `ALTER TABLE "ticket" ADD COLUMN IF NOT EXISTS "type" text`,
  `ALTER TABLE "ticket" ADD COLUMN IF NOT EXISTS "tags" jsonb`,
  // ---- Milestone 6: audit log + weekly client digest opt-out ----
  `CREATE TABLE IF NOT EXISTS "audit_log" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "actor_id" text, "actor_name" text,
    "action" text NOT NULL, "entity" text NOT NULL, "entity_id" text,
    "meta" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "audit_log_created_idx" ON "audit_log" ("created_at")`,
  `CREATE INDEX IF NOT EXISTS "audit_log_entity_idx" ON "audit_log" ("entity")`,
  `CREATE INDEX IF NOT EXISTS "audit_log_action_idx" ON "audit_log" ("action")`,
  `ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "digest_opt_out" boolean DEFAULT false NOT NULL`,
  // ---- Sage conversation history (searchable chat threads) ----
  `CREATE TABLE IF NOT EXISTS "sage_conversation" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL,
    "title" text NOT NULL,
    "scope" text DEFAULT 'firm' NOT NULL,
    "client_id" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "sage_conversation_user_idx" ON "sage_conversation" ("user_id", "updated_at")`,
  `CREATE TABLE IF NOT EXISTS "sage_message" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "conversation_id" uuid NOT NULL,
    "role" text NOT NULL,
    "content" text NOT NULL,
    "citations" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "sage_message_conversation_idx" ON "sage_message" ("conversation_id", "created_at")`,
  // ---- Admin → client document feedback (return-for-correction) ----
  `ALTER TABLE "service_request_document" ADD COLUMN IF NOT EXISTS "correction_reason" text`,
  `ALTER TABLE "service_request_document" ADD COLUMN IF NOT EXISTS "correction_requested_at" timestamp with time zone`,
  // ---- Email outbox (logged, deduped, retryable sends — lib/email.ts) ----
  `CREATE TABLE IF NOT EXISTS "email_outbox" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "dedupe_key" text NOT NULL,
    "to" text NOT NULL,
    "subject" text NOT NULL,
    "status" text DEFAULT 'queued' NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "retryable" boolean DEFAULT true NOT NULL,
    "payload" jsonb,
    "last_error" text,
    "duration_ms" integer,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "sent_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "email_outbox_dedupe_uidx" ON "email_outbox" ("dedupe_key")`,
  `CREATE INDEX IF NOT EXISTS "email_outbox_status_idx" ON "email_outbox" ("status", "created_at")`,
  // ---- Shared rate-limit counters (lib/rate-limit.ts; swept by /api/cron/sweep) ----
  `CREATE TABLE IF NOT EXISTS "rate_limit" (
    "key" text NOT NULL,
    "window_start" bigint NOT NULL,
    "count" integer DEFAULT 0 NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    PRIMARY KEY ("key", "window_start"))`,
  `CREATE INDEX IF NOT EXISTS "rate_limit_expires_idx" ON "rate_limit" ("expires_at")`,
  // ---- Redesign: AI privacy, deposits, follow-ons, review rounds, bank proof ----
  `ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "ai_mode" text DEFAULT 'cloud_masked' NOT NULL`,
  `ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "ai_mode_reason" text`,
  `ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "ai_mode_set_by" text`,
  `ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "ai_mode_set_at" timestamp with time zone`,
  `ALTER TABLE "invoice" ADD COLUMN IF NOT EXISTS "parent_invoice_id" uuid`,
  `ALTER TABLE "invoice" ADD COLUMN IF NOT EXISTS "deposit_percent" integer`,
  `ALTER TABLE "service_request" ADD COLUMN IF NOT EXISTS "parent_request_id" uuid`,
  `ALTER TABLE "service_request" ADD COLUMN IF NOT EXISTS "review_round" integer DEFAULT 0 NOT NULL`,
  `ALTER TABLE "service_request_document" ADD COLUMN IF NOT EXISTS "stage" text`,
  `ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "proof_key" text`,
  `ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "proof_file_name" text`,
  `ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "confirmed_by" text`,
  `ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "confirmed_at" timestamp with time zone`,
  `CREATE INDEX IF NOT EXISTS "payment_request_idx" ON "payment" ("request_id")`,
  // ---- Redesign: invitations, staff assignment, asks, reviews, notifications, drafts ----
  `CREATE TABLE IF NOT EXISTS "invitation" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "email" text NOT NULL,
    "role" text NOT NULL,
    "client_id" uuid,
    "token_hash" text NOT NULL,
    "message" text,
    "invited_by" text NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "redeemed_at" timestamp with time zone,
    "redeemed_by" text,
    "revoked_at" timestamp with time zone,
    "last_sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "invitation_token_uidx" ON "invitation" ("token_hash")`,
  `CREATE INDEX IF NOT EXISTS "invitation_email_idx" ON "invitation" ("email")`,
  `CREATE TABLE IF NOT EXISTS "request_assignment" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "request_id" uuid NOT NULL,
    "user_id" text NOT NULL,
    "assigned_by" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "request_assignment_uidx" ON "request_assignment" ("request_id", "user_id")`,
  `CREATE INDEX IF NOT EXISTS "request_assignment_user_idx" ON "request_assignment" ("user_id")`,
  `CREATE TABLE IF NOT EXISTS "request_item" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "request_id" uuid NOT NULL,
    "kind" text NOT NULL,
    "title" text NOT NULL,
    "detail" text,
    "status" text DEFAULT 'open' NOT NULL,
    "due_at" timestamp with time zone,
    "answer" text,
    "document_id" uuid,
    "created_by" text,
    "supplied_at" timestamp with time zone,
    "received_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "request_item_request_idx" ON "request_item" ("request_id", "status")`,
  `CREATE TABLE IF NOT EXISTS "review_round" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "request_id" uuid NOT NULL,
    "round" integer NOT NULL,
    "document_id" uuid,
    "sent_at" timestamp with time zone DEFAULT now() NOT NULL,
    "decision" text,
    "comments" jsonb,
    "decided_at" timestamp with time zone,
    "decided_by" text)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "review_round_uidx" ON "review_round" ("request_id", "round")`,
  `CREATE TABLE IF NOT EXISTS "notification" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL,
    "category" text NOT NULL,
    "title" text NOT NULL,
    "body" text,
    "link" text,
    "dedupe_key" text,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "notification_user_idx" ON "notification" ("user_id", "created_at")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "notification_dedupe_uidx" ON "notification" ("user_id", "dedupe_key")`,
  `CREATE TABLE IF NOT EXISTS "notification_pref" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL,
    "category" text NOT NULL,
    "mode" text DEFAULT 'immediate' NOT NULL,
    "email" boolean DEFAULT true NOT NULL,
    "push" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "notification_pref_uidx" ON "notification_pref" ("user_id", "category")`,
  `CREATE TABLE IF NOT EXISTS "request_draft" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "email" text,
    "service_slug" text,
    "answers" jsonb,
    "claimed_by_user_id" text,
    "claimed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "request_draft_email_idx" ON "request_draft" ("email")`,  // NDPA erasure with a 30-day hold (scheduled -> cancel or erased by the sweep).
  `ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "erasure_requested_at" timestamp with time zone`,
  `ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "erasure_requested_by" text`,
  `ALTER TABLE "client" ADD COLUMN IF NOT EXISTS "erased_at" timestamp with time zone`,
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
// Run only when executed directly (restore-backup.ts imports STATEMENTS/ssl).
if (/apply-schema\.ts$/.test(process.argv[1] ?? "")) {
  main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
}
