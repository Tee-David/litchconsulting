CREATE TABLE "client" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"company" text,
	"email" text,
	"phone" text,
	"address" text,
	"tax_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"client_id" uuid,
	"bill_to_name" text,
	"bill_to_company" text,
	"bill_to_email" text,
	"bill_to_address" text,
	"bill_to_tax_id" text,
	"project_title" text,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date,
	"notes" text,
	"terms" text,
	"payment_url" text,
	"public_token" text NOT NULL,
	"subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"amount_paid" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	CONSTRAINT "invoice_number_unique" UNIQUE("number"),
	CONSTRAINT "invoice_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE "invoice_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"detail" text,
	"quantity" numeric(12, 2) DEFAULT '1' NOT NULL,
	"unit_price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_rate" numeric(6, 2) DEFAULT '0' NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"source" text DEFAULT 'newsletter' NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "client_email_idx" ON "client" USING btree ("email");--> statement-breakpoint
CREATE INDEX "invoice_status_idx" ON "invoice" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoice_client_idx" ON "invoice" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "invoice_created_idx" ON "invoice" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "invoice_item_invoice_idx" ON "invoice_item" USING btree ("invoice_id");