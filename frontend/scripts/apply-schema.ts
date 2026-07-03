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
  `CREATE TABLE IF NOT EXISTS "org_settings" (
    "id" text PRIMARY KEY,
    "company_name" text, "logo_url" text,
    "bank_name" text, "account_name" text, "account_number" text,
    "invoice_from_email" text, "default_currency" text, "invoice_terms" text,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL)`,
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.COCKROACHDB_URL, ssl: ssl() });
  for (const sql of STATEMENTS) {
    await pool.query(sql);
    console.log("✓", sql.split("\n")[0].trim().slice(0, 60));
  }
  for (const t of ["client", "invoice", "invoice_item"]) {
    const r = await pool.query(`SELECT count(*)::int AS n FROM "${t}"`);
    console.log(`  ${t}: ${r.rows[0].n} rows`);
  }
  await pool.end();
  console.log("Done.");
  process.exit(0);
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
