# CLAUDE.md — Litch Consulting

Guidance for Claude when working in this repository.

## What this is

**Litch Consulting** — website + admin platform for a Nigerian professional finance firm
(financial reporting, modelling, taxation, forensic accounting, data analytics, advisory).
A polished marketing site **and** a role-gated admin dashboard with an invoicing engine.

- Live: https://www.litchconsulting.com (Vercel, auto-deploys `main`)
- Repo: https://github.com/Tee-David/litchconsulting (`main`)
- The web app lives in **`frontend/`** (Next.js full-stack). **`backend/`** is **LitchAI** — a
  separate Python pipeline that compiles client financial documents into formula-driven Excel
  files (spec: `plans/prd.md`, progress: `plans/checklist.md`; `plans/` is gitignored). It
  deploys to its own OCI VM, never to Vercel.
- Reader-facing docs: `README.md` (root, two-app architecture), `frontend/README.md`,
  `backend/README.md`. They must never cite `plans/` paths — that dir is gitignored.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 (CSS-first tokens in
`globals.css`) · framer-motion · Better Auth · Drizzle + CockroachDB · Cloudflare R2 ·
nodemailer (Truehost SMTP) · @react-pdf/renderer · @tanstack/react-table · recharts · cmdk ·
react-joyride · Paystack · Cal.com · web-push · Doppler · Vercel.

All mail is nodemailer/SMTP (`lib/email.ts`) — there is **no** Resend integration.

## Data & services

- **Reads:** admin pages are RSCs querying **Drizzle** directly (`lib/db/queries/*`).
  Better Auth **owns and creates** the `user` table; `schema.ts` carries a read/admin
  **mapping** of it (used by settings user management) — never create/migrate it via
  `apply-schema.ts`, and let Better Auth handle signup/password flows.
- **Writes:** **server actions** (`app/admin/**/actions.ts`), each guarded by `isAdmin()`.
  Money totals are always recomputed server-side (`lib/invoice/money.ts`).
- **Auth:** Better Auth (`lib/auth.ts`), roles `admin | client` on the session user.
  `lib/server-user.ts` has `getSessionUser/isAdmin`. Admin gate in `app/admin/layout.tsx`;
  `/dashboard` redirects admins → `/admin`.
- **Schema:** `lib/db/schema.ts` — `lead, client, invoice, invoice_item, expense, payment, post,
  template, ticket, ticket_message, service_offering, service_request, service_request_event,
  service_request_document, consultation, client_note, audit_log, push_subscription,
  org_settings` + the Better Auth `user` mapping (see Reads above).
- **Soft delete:** `client/invoice/ticket/service_request` carry `deleted_at`. Queries filter
  `isNull(deletedAt)`; `/admin/trash` restores or type-to-confirm purges; `/api/cron/sweep`
  purges rows soft-deleted >30d ago.
- **Audit:** `lib/audit.ts` `recordAudit()` → `audit_log`; rendered at `/admin/audit`. Call it
  from destructive/consequential actions (Copilot proposal dispatch already does).
- **Storage:** R2 public bucket = assets; `R2_PRIVATE_BUCKET` = client documents, deliverables
  **and DB backups** — private access only via ownership-checked presigned URLs.
- **Tax rates:** `lib/tax/nigeria-tax-config.json` is the **single versioned source** of
  Nigerian tax rates (NTA 2025: PAYE bands, VAT, WHT, CIT + Development Levy, pension/NHF).
  `lib/calculators/*` and the LitchAI compilers both read it — never hardcode a rate.
- **Invoicing:** builder (`components/admin/invoice/invoice-builder.tsx`) → live HTML preview
  (`invoice-preview.tsx`) → branded PDF (`lib/invoice/pdf/InvoiceDocument.tsx`, `render.ts`) →
  SMTP send + public `/i/[token]` pay page. Receipts reuse the PDF with `variant="receipt"`.

## Platform surfaces

- **Charts:** `components/charts/*` — Recharts wrappers `AreaTrend`, `GroupedBars`, `Donut`, plus
  `PeriodFilter` and the `CATEGORICAL` palette. Formatting crosses RSC→client as a serializable
  `format` token (`"money" | "number" | "percent"`), **never** a function. The legacy SVG
  `admin/ui/charts.tsx` still serves the public calculators — don't delete it.
- **LitchAI Copilot:** `/admin/assistant` → `/api/copilot` relay (`isAdmin()`-guarded) →
  `lib/litchai/client.ts` → backend `POST /assistant/chat`. Grounded over `knowledge_chunk`
  (pgvector HNSW + pg_trgm, RRF-fused). The contract is `citations` / `tool` / `proposal` —
  **reads return data, writes return a proposal only**, dispatched by `assistant/actions.ts`
  after human confirm, audit-logged. Everything is gated on `LITCHAI_API_URL`; the app must
  degrade cleanly without it. (`askEngagement` keeps the older `EngagementAskResponse` shape.)
- **⌘K palette:** `components/admin/command-palette.tsx` (cmdk) + `app/admin/command-actions.ts`
  (admin-guarded cross-entity search over clients/requests/invoices).
- **Crons** (`vercel.json`, each guarded by `CRON_SECRET`): `/api/cron/sweep` `0 7 * * *` (purge),
  `/api/cron/backup` `30 3 * * *` (CockroachDB → private R2, rotation; Settings Backups card at
  `app/admin/settings/backups-card.tsx` triggers it on demand), `/api/cron/digest` `0 8 * * 1`
  (weekly client digest; opt-out via `client.digest_opt_out` on `/dashboard/settings`).
- **Tours:** `components/tour/*` (react-joyride) — registry, route-match, wait-for-target,
  cross-page controller, animated launcher, confetti. Anchors are `data-tour`; providers mount in
  both shells. Reduced-motion aware.
- **Help desk:** 3-pane admin `/admin/help-desk` (list/thread/details, timeline, tags, team,
  type) + client hub `/dashboard/support`.

## Gotchas / conventions

- **`drizzle-kit push` HANGS** on CockroachDB introspection. Apply schema changes with
  `scripts/apply-schema.ts` (`CREATE TABLE IF NOT EXISTS …`). Extend it as the schema grows,
  then run `node --env-file=.env.local --import tsx scripts/apply-schema.ts`. The CA cert is
  at `frontend/certs/cockroach-ca.crt` (also read by the app/drizzle SSL resolvers).
- **Env:** secrets live in the repo-root `.env` (gitignored) + **Doppler** (`litch-consulting`).
  Next reads `frontend/.env*`, so local dev uses `frontend/.env.local` (a copy of `.env`).
  Sync to Vercel with `scripts/vercel-sync-env.mjs`. Don't sync `BETTER_AUTH_URL` (localhost)
  — Better Auth infers the URL from the request host in prod.
- **Localhost logins:** if sign-in "succeeds" but you land back on /login, check
  `frontend/.env.local` has `BETTER_AUTH_URL=http://localhost:3000`. With an `https://…`
  value, Better Auth issues **Secure** cookies that the browser drops on plain-HTTP
  localhost, so no session ever sticks (the middleware cookie check then bounces you).
  After editing env, restart `npm run dev`. Also: email verification is required to log in
  (`requireEmailVerification: true`) — for local signups without SMTP configured, grab the
  verification link from the dev-server terminal (lib/email logs unsent mail), or verify
  the row manually: `UPDATE "user" SET "emailVerified"=true WHERE email='…'`. Google OAuth
  works locally only if the Google console lists `http://localhost:3000` as a redirect origin.
- **PDF ₦ glyph:** Helvetica lacks the Naira sign, so the PDF registers **Noto Sans** from
  `lib/invoice/pdf/fonts/*.ttf`. `next.config.ts` `outputFileTracingIncludes` ships those
  fonts with the PDF serverless functions.
- **Dark mode:** brand navy (`text-brand`) is invisible on dark surfaces → `globals.css`
  flips `text-brand` to white in dark mode, except elements marked `keep-brand` (white pills).
- **Tables:** the `DataTable` scroll container clips absolute menus — render row-action
  dropdowns in a **portal** (see `invoice-list.tsx`).
- **Lint:** the experimental React-Compiler rules (`set-state-in-effect`, `purity`,
  `immutability`) are relaxed in `eslint.config.mjs` (false positives on RSC time reads,
  one-shot init effects, tanstack `getState()`).

## Commands

```bash
# Start localhost dev server (runs on port 3000)
cd frontend
npm run dev

# Other frontend commands
cd frontend
npm run build | start | lint
npm run db:generate                                             # generate migration SQL
node --env-file=.env.local --import tsx scripts/apply-schema.ts # apply schema (NOT db:push)
node --env-file=.env.local --import tsx scripts/seed-users.ts   # seed users
node --env-file=.env.local scripts/vercel-sync-env.mjs          # push env to Vercel

cd backend                                                       # LitchAI (Python)
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"       # one-time setup
.venv/bin/pytest                                                 # golden-fixture suite (needs LibreOffice)
.venv/bin/ruff check src tests
.venv/bin/python -m litchai.knowledge reindex                    # rebuild Copilot RAG store
```

## LitchAI transport

The VM binds uvicorn to **loopback only**; a Cloudflare Tunnel (`ai.litchconsulting.com`) is the
sole ingress, fronted by a Cloudflare Access app with a non-identity policy. `lib/litchai/client.ts`
is `server-only` and authenticates machine-to-machine with a service token
(`LITCHAI_ACCESS_CLIENT_ID` / `LITCHAI_ACCESS_CLIENT_SECRET`); uploads go through
`blind-relay.ts` — Vercel forwards ciphertext and never holds a usable plaintext or decrypt key.
Units/ops live in `backend/deploy/` (`litchai-api`, `litchai-worker`, backup + heartbeat timers,
`RUNBOOK.md`).

## Deploy

Push to `main` → Vercel. Shared CockroachDB → schema changes (via `apply-schema.ts`) take
effect on the live app immediately; no redeploy needed for data/schema.

## House style

Match the surrounding code. Reuse `components/ui/primitives.tsx`, `admin/ui/*`, semantic
Tailwind tokens (`bg-paper/cloud/surface`, `text-ink/body`, `border-hairline`, `bg-brand`).
Keep the invoice **preview** and **PDF** visually in sync (same layout, watermark, stamp,
signature). Push after meaningful chunks; keep `tsc`, lint, and `build` green.


Always call me Tee-David in your responses.