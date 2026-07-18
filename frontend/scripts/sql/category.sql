-- Managed blog/template categories. Paste into the CockroachDB SQL Shell (defaultdb).
-- Idempotent — safe to re-run.
CREATE TABLE IF NOT EXISTS "category" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" text NOT NULL,
  "name" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "category_kind_name_idx" ON "category" ("kind", "name");

-- Seed blog categories from the tags already used by existing posts, plus the
-- editor's previous fixed list. ON CONFLICT keeps this safe to re-run.
INSERT INTO "category" ("kind", "name")
SELECT 'blog', tag FROM (SELECT DISTINCT tag FROM "post" WHERE tag IS NOT NULL AND tag <> '') t
ON CONFLICT ("kind", "name") DO NOTHING;
INSERT INTO "category" ("kind", "name") VALUES
  ('blog','Taxation'),('blog','Modelling'),('blog','Reporting'),
  ('blog','Analytics'),('blog','Advisory'),('blog','Forensics'),('blog','Insights')
ON CONFLICT ("kind", "name") DO NOTHING;

-- Verify:
SELECT kind, name FROM "category" ORDER BY kind, name;
