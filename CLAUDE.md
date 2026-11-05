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
  files and runs the AI engine behind Sage and the workbench. It deploys to its own OCI VM
  (`/srv/projects/litchconsulting`), never to Vercel.
- Reader-facing docs: `README.md` (root, two-app architecture), `frontend/README.md`,
  `backend/README.md`, `backend/deploy/RUNBOOK.md`. Never cite the gitignored planning folder in
  them.

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
- **Writes:** **server actions**, each re-checking access on the server (`requireArea`/`hasAccess`
  from `lib/server-user.ts`, or the admin `actor(area)` guard in `app/admin/_lib/guard.ts`).
  Money totals are always recomputed server-side (`lib/invoice/money.ts`).
- **Auth and roles:** Better Auth (`lib/auth.ts`), roles `admin | staff | client` (server-only
  field). `lib/access.ts` is the one access map (`canAccess`, `accessMatrix`, `homeFor`):
  admin → `/admin`, staff → `/work` (assigned requests only via `request_assignment`, never money),
  client → `/dashboard`. Self sign-up makes clients; staff/admins/client colleagues come from
  invitations (`lib/invitations.ts`, `/invite/[token]`). **Two-step sign-in is required for admin
  and staff and enforced on the server**: a firm session without an authenticator or without a
  passed code (`session_two_step`) is treated as signed out by `getSessionUser` and held at
  `/account/two-step`. Every sign-in finishes at `/account/continue`.
- **Schema:** `lib/db/schema.ts` — `lead, client, invoice, invoice_item, expense, payment, post,
  template, ticket, ticket_message, service_offering, service_request, service_request_event,
  service_request_document, consultation, client_note, audit_log, push_subscription,
  sage_conversation, sage_message, org_settings` + the Better Auth `user` mapping (see Reads above).
- **Soft delete:** `client/invoice/ticket/service_request` carry `deleted_at`. Queries filter
  `isNull(deletedAt)`; `/admin/trash` restores or type-to-confirm purges; `/api/cron/sweep`
  purges rows soft-deleted >30d ago.
- **Audit:** `lib/audit.ts` `recordAudit()` → `audit_log`; rendered at `/admin/audit`. Call it
  from destructive/consequential actions (Sage proposal dispatch already does).
- **Storage:** R2 `litch-consulting` (public) = assets; `litch-consulting-private`
  (`R2_PRIVATE_BUCKET`) = client documents, deliverables **and DB backups** — private access
  only via ownership-checked presigned URLs.
  > ⚠️ **The R2 credentials in `.env` are scoped to Litch's two buckets only** —
  > `litch-consulting` + `litch-consulting-private` are reachable; every other project's
  > bucket (`voca`, `trax`, `nomarc`, `wendiloveee`, …) and `ListBuckets` return
  > **AccessDenied** (verified). They also can't manage bucket CORS (object-scoped), so a
  > CORS change needs an R2-admin token or the Cloudflare dashboard. **Still: only ever use
  > them for Litch Consulting.** Any *new* credential added here must be Litch-scoped too —
  > a `CLOUDFLARE_TOKEN` scoped to `realtorspractice.com.ng` was removed from `.env` for
  > exactly this reason; another project's credential has no business in this one.
- **Tax rates:** `lib/tax/nigeria-tax-config.json` is the **single versioned source** of
  Nigerian tax rates (NTA 2025: PAYE bands, VAT, WHT, CIT + Development Levy, pension/NHF).
  `lib/calculators/*` and the LitchAI compilers both read it — never hardcode a rate.
- **Invoicing:** builder (`components/admin/invoice/invoice-builder.tsx`) → live HTML preview
  (`invoice-preview.tsx`) → branded PDF → SMTP send + public `/i/[token]` pay page. Receipts
  reuse the PDF with `variant="receipt"`. **PDF is an exact replica of the preview:** the
  primary path prints the same HTML via headless Chromium (`lib/invoice/pdf/{invoice-html.ts,
  render-html.ts}`), falling back to `@react-pdf` (`InvoiceDocument.tsx`) only if Chromium can't
  launch. **Parity rule — a document-body change must land in ALL THREE** (`invoice-preview.tsx`,
  `invoice-html.ts`, `InvoiceDocument.tsx`) or the fallback silently diverges; keep fixed hex
  (`BRAND/INK/BODY/MUTED/HAIR/TINT`) inside the paper, semantic tokens only outside it. The
  watermark masks `public/brand/litch-mark.svg` (evenodd) in preview+HTML — never fill the path
  (nonzero → grey disc). `@sparticuz/chromium` `bin/**` must be traced into **every** PDF route
  in `next.config.ts` `outputFileTracingIncludes` (incl. `/pay/**`, the receipt path).

## Platform surfaces

- **Charts:** `components/charts/*` — Recharts wrappers `AreaTrend`, `GroupedBars`, `Donut`, plus
  `PeriodFilter` and the `CATEGORICAL` palette. Formatting crosses RSC→client as a serializable
  `format` token (`"money" | "number" | "percent"`), **never** a function. The legacy SVG
  `admin/ui/charts.tsx` still serves the public calculators — don't delete it.
- **Sage (the AI assistant):** `/admin/sage` → `/api/sage` relay (`isAdmin()`-guarded) →
  `lib/litchai/client.ts` → backend `POST /assistant/chat`. Grounded over `knowledge_chunk`
  (pgvector HNSW + pg_trgm, RRF-fused). The contract is `citations` / `tool` / `proposal` —
  **reads return data, writes return a proposal only**, dispatched by `app/admin/sage/actions.ts`
  after human confirm, audit-logged. Everything is gated on `LITCHAI_API_URL`; the app must
  degrade cleanly without it. Chat threads persist per admin user in `sage_conversation` +
  `sage_message` (searchable history rail). **Naming:** *Sage* is the only user-facing name;
  *LitchAI* is engine-only (env `LITCHAI_*`, the `lib/litchai/` transport, the VM). Never
  reintroduce "copilot"/"assistant" as a user-facing label.
- **Analyses (AI Studio):** `/admin/analyses` (`components/admin/analyses/*`) is the separate
  document→Excel workbench over the same LitchAI engine — not the chatbot. Old routes
  `/admin/assistant` and `/admin/litchai` permanently redirect (`next.config.ts`).
- **⚠️ Keeping Sage current (do this when you ship a substantial surface/capability):** Sage
  only knows what's in its grounding + tools, so a big new feature is invisible to it until you
  teach it. When you add a meaningful admin surface or capability, in the same change: (1) add
  a short **knowledge chunk** describing it to the RAG store, (2) add a couple of **router
  example utterances** to `backend/src/litchai/ai/assistant.py` `TOOLS` if it's queryable, (3)
  add a **read tool** (returns data) or **write proposal** (human-confirmed) if it's
  actionable, then (4) `python -m litchai.knowledge reindex`. Rule of thumb: if a user would
  reasonably ask Sage about the new thing, Sage must be updated to know about it — otherwise
  the assistant silently drifts behind the product.
- **⌘K palette:** `components/admin/command-palette.tsx` (cmdk) + `app/admin/command-actions.ts`
  (admin-guarded cross-entity search over clients/requests/invoices).
- **Crons** (`vercel.json`, each guarded by `CRON_SECRET`): `/api/cron/outbox` `30 6 * * *`
  (retry failed email), `/api/cron/sweep` `0 7 * * *` (Trash purge, due erasures, nudges, rate-limit
  rows), `/api/cron/reminders` `0 9 * * *` (invoice reminders), `/api/cron/backup` `30 3 * * *`
  (JSON snapshot to private R2 via `lib/backup/db-backup.ts`; Settings → Backups runs it on demand
  and has a restore test), `/api/cron/digest` `0 8 * * 1` (weekly client digest).
- **Emails:** every email is a template in `lib/email-templates.ts` (escaped plain-text builders,
  "why you got this" footer, signed unsubscribe). All sends go through the outbox in `lib/email.ts`.
- **Privacy:** cookie notice in `components/consent/*` (only necessary cookies; Cal.com after
  consent). Record of processing in `lib/privacy/register.ts` → `/admin/settings/privacy`; keep it
  and the privacy policy in `lib/content.ts` in step when you add a processor or data store.
- **CI:** `.github/workflows/ci.yml` (tsc, eslint errors, vitest; backend ruff error gate + pytest).
- **Tours:** `components/tour/*` (react-joyride) — registry, route-match, wait-for-target,
  cross-page controller, animated launcher, confetti. Anchors are `data-tour`; providers mount in
  the admin, staff and client shells; completion is stored per user and tour version. Bump a
  tour's `version` when its stops change.
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
.venv/bin/python -m litchai.knowledge reindex                    # rebuild Sage RAG store
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