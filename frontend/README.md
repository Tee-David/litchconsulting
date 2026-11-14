# Litch Consulting: Web platform

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs&style=flat-square)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&style=flat-square)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&style=flat-square)
![Better Auth](https://img.shields.io/badge/Better_Auth-1.6-0a196d?style=flat-square)
![Drizzle](https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&style=flat-square)
![CockroachDB](https://img.shields.io/badge/CockroachDB-PostgreSQL-6933FF?logo=cockroachlabs&style=flat-square)
![Recharts](https://img.shields.io/badge/Recharts-charts-FF6384?style=flat-square)
![Vercel](https://img.shields.io/badge/Vercel-deploy-000000?logo=vercel&style=flat-square)

The Litch Consulting web platform: a marketing site, an admin dashboard (`/admin`), a staff
workspace (`/work`) and a client portal (`/dashboard`), one full-stack Next.js application. There is **no separate API server**; reads are React
Server Components querying Drizzle directly, and writes are server actions.

---

## Core features

### Marketing site
Services, case studies, insights, contact/booking, and legal pages, plus twelve Nigerian finance
calculators at `/calculators`, PAYE, CIT, VAT, WHT, stamp duty, import duty, salary, reverse
salary, pension, loan, mortgage and compound interest. Installable as a PWA with an offline
fallback.

### Invoicing engine
A split-view builder (`components/admin/invoice/invoice-builder.tsx`) drives a live HTML preview
(`invoice-preview.tsx`), which is rendered to a branded PDF
(`lib/invoice/pdf/InvoiceDocument.tsx`, `render.ts`), sent over SMTP, and paid on a public
`/i/[token]` page via Paystack. Receipts reuse the same document with `variant="receipt"`.

Money totals are **always recomputed server-side** in `lib/invoice/money.ts`, never trusted from
the client.

### Roles and access
Three roles: `admin` (everything), `staff` (only requests assigned to them through
`request_assignment`, never money amounts) and `client` (their own company). `lib/access.ts` is
the single access map (`canAccess`, `accessMatrix`, `homeFor`); `lib/server-user.ts` enforces it
(`requireArea`, `hasAccess`, `canWorkOnRequest`). Settings → Team and access renders the same map.

### Sign-in, two-step and invitations
- Self sign-up always makes a client. Staff, admins and client colleagues arrive by invitation
  (`lib/invitations.ts`, `/invite/[token]`): a single-use 32-byte token stored only as a hash,
  7 days, the email fixed by the invitation (Google sign-in must use that email).
- Two-step sign-in (Better Auth `twoFactor`) is **required for admin and staff and enforced on the
  server**: a firm session without an authenticator, or one that has not passed the code
  (`session_two_step`), counts as signed out until it does (`/account/two-step`). Admins can reset
  someone's two-step from Team and access. Optional for clients.
- Every sign-in finishes at `/account/continue`, which picks the right door per role, claims a
  service chosen before sign-up (`request_draft`), and shows the first-run welcome once.
- `/account/security`: devices (sign one out or all others), password, two-step, sign-in history.

### Admin dashboard
Home (what needs you), requests (views incl. Unassigned, bulk assign), clients (privacy tab with
AI mode and NDPA erasure), billing (quotes, invoices, receipts, payments with transfer proofs,
expenses, tools), the Analyses workbench, Sage, help desk, reports, website content, audit log,
trash and settings (firm and users, team and access, notifications, backups with a restore test,
privacy register, integrations).

### Staff workspace (`/work`)
My work, my requests, files (the workbench for assigned files), conversations and notifications.

### Client portal (`/dashboard`)
Home (what needs you), requests with asks and draft review, quotes (one-click accept), billing
and pay (card or transfer proof, deposits), files, support, notifications and settings.

### Sage
`/admin/sage` is a grounded admin assistant. The page calls the `/api/sage` relay, which
is admin-guarded and forwards to the LitchAI backend's `POST /assistant/chat` over a
Cloudflare Access service token. Answers carry citations; **write actions arrive as proposals**
that a human confirms before `app/admin/sage/actions.ts` executes them (audit-logged). All LitchAI
features are gated on `LITCHAI_API_URL` being set, without it, the rest of the app is unaffected.

### Charts
Recharts wrappers in `components/charts/*`, `AreaTrend`, `GroupedBars`, `Donut`, plus
`PeriodFilter` and a shared `CATEGORICAL` palette. Formatting crosses the RSC→client boundary as a
serializable `format` token (`"money" | "number" | "percent"`), **not** a function, functions
can't be passed to client components.

> The legacy hand-rolled SVG charts in `components/admin/ui/charts.tsx` still serve the public
> calculators. Don't delete them.

### Command palette
A `cmdk` palette in the admin shell (⌘K / Ctrl+K) with quick actions and cross-entity search over
clients, requests and invoices (`app/admin/command-actions.ts`, admin-guarded).

### Soft delete + Trash
`client`, `invoice`, `ticket` and `service_request` carry `deleted_at`. Queries filter
`isNull(deletedAt)`; `/admin/trash` offers restore and type-to-confirm permanent delete. The
`/api/cron/sweep` job purges anything soft-deleted more than 30 days ago.

### Audit log
`lib/audit.ts` exposes `recordAudit()`, writing to the `audit_log` table; `/admin/audit` renders
the trail.

### Backups
`/api/cron/backup` writes a JSON snapshot of the business tables to the **private** R2 bucket
(the Better Auth tables are not included). Old copies are not rotated automatically yet. The Settings page
carries a Backups card (`app/admin/settings/backups-card.tsx`) for on-demand runs and downloads,
which reuses `CRON_SECRET`.

### Weekly client digest
`/api/cron/digest` emails clients a weekly summary each Monday. Clients opt out from
`/dashboard/settings` (`client.digest_opt_out`).

### Guided tours and onboarding
A tour engine in `components/tour/*`, registry, route matching, target waiting, an animated
launcher, a cross-page walkthrough controller, and confetti on completion, reduced-motion aware
throughout. Anchors are `data-tour` attributes; providers mount in the admin, staff and client
shells, and completion is stored per user and tour version (`user_onboarding.tours`). A per-role
getting-started checklist (`components/access/onboarding.tsx`) sits on each home until done.

### Emails
Every email is a template in `lib/email-templates.ts`: audience, merge tags, a "why you got
this" footer, a link to the matching notification setting and a signed one-click unsubscribe
(`/unsubscribe`) where the category allows it. Everything is escaped; builders take plain text.
All sends go through the outbox in `lib/email.ts` (`email_outbox`, retried by the outbox cron).

### Privacy (NDPA)
A cookie notice (`components/consent/*`, choice in the `litch_consent` cookie, re-opened from the
footer): only strictly necessary cookies; the Cal.com calendar loads only after consent. The
privacy policy lives in `lib/content.ts`; the record of processing is `lib/privacy/register.ts`,
shown at `/admin/settings/privacy`.

### SEO
JSON-LD (`lib/seo/jsonld.ts`): ProfessionalService on the home page, Service and FAQPage on
service pages, Article on insights and case studies, BreadcrumbList throughout. `app/sitemap.ts`
lists every service, request page, insight, case study and legal page with real lastModified dates.

### Help desk
A three-pane admin help desk at `/admin/help-desk` (list / thread / details, with progress
timeline, tags, team and type), paired with a client Help & Support hub at `/dashboard/support`.

---

## Architecture

```
frontend/
├── src/app/
│   ├── (auth)/                Sign in, sign up, verify, reset, unsubscribe
│   ├── account/               continue (post sign-in router), security, two-step, welcome
│   ├── invite/[token]/        Accept an invitation (password or Google)
│   ├── work/                  Staff workspace
│   ├── admin/                 Admin dashboard (requireArea-gated in layout.tsx)
│   │   ├── sage/              Sage chat UI + history + confirm-gated actions
│   │   ├── audit/             Audit log viewer
│   │   ├── clients/ requests/ billing/ analyses/ reports/ blog/ services/
│   │   ├── help-desk/ notifications/ settings/ (access, backups, privacy, integrations) trash/
│   │   └── command-actions.ts ⌘K cross-entity search (server action)
│   ├── dashboard/             Client portal (requests, quotes, billing, files, support, settings)
│   ├── api/                   sage, cron/*, paystack, calcom, push, upload, contact …
│   ├── i/[token]/             Public pay page
│   ├── calculators/           Public Nigerian tax calculators
│   └── globals.css            Tailwind v4 CSS-first design tokens
├── src/components/
│   ├── ui/                    primitives.tsx, select, combobox, field, confirm-dialog …
│   ├── admin/                 shell, nav, command-palette, invoice/, settings/, litchai/
│   ├── charts/                Recharts wrappers + PeriodFilter + palette
│   ├── tour/                  Tour engine (registry, provider, launcher, confetti)
│   ├── calculators/           Public calculator UIs
│   └── layout/ sections/      Marketing chrome and page sections
├── src/lib/
│   ├── access.ts              Roles and the access map
│   ├── auth.ts server-user.ts Better Auth (+ twoFactor) and the server guards
│   ├── two-step.ts invitations.ts onboarding.ts email-templates.ts
│   ├── db/                    schema.ts, client.ts, queries/*
│   ├── invoice/               money.ts, pdf/ (InvoiceDocument, render, Noto Sans fonts)
│   ├── litchai/               client.ts (Access service token), blind-relay.ts
│   ├── tax/                   nigeria-tax-config.json, the single source of rates
│   ├── audit.ts email.ts r2.ts
│   ├── privacy/ seo/          Processing register, erasure; JSON-LD builders
│   └── emails/                requests.ts (request lifecycle, via email-templates)
├── scripts/                   apply-schema, seed-users, vercel-sync-env, inspect-db
└── certs/cockroach-ca.crt     CockroachDB cluster CA
```

---

## Data & services

**Reads**, admin pages are RSCs querying Drizzle directly (`lib/db/queries/*`).

**Writes**, server actions, each re-checking access on the server (`requireArea`/`hasAccess`, or
the admin `actor(area)` guard).

**Auth**, Better Auth (`lib/auth.ts`), roles `admin | staff | client` on the session user
(server-only field). `lib/server-user.ts` exposes `getSessionUser`, `requireArea`, `hasAccess`,
`canWorkOnRequest` and the two-step hold. Each shell's layout guards its role and sends anyone
else to their own home (`homeFor`).

> Better Auth **owns and creates** the `user` table. `schema.ts` carries a read/admin **mapping**
> of it for settings user management, never create or migrate `user` via `apply-schema.ts`, and
> let Better Auth handle signup and password flows.

**Schema** (`lib/db/schema.ts`), `lead`, `client`, `invoice`, `invoice_item`, `expense`,
`payment`, `post`, `template`, `ticket`, `ticket_message`, `service_offering`, `service_request`,
`service_request_event`, `service_request_document`, `consultation`, `client_note`, `audit_log`,
`push_subscription`, `org_settings`, `invitation`, `client_member`, `request_assignment`,
`request_item`, `review_round`, `notification`, `notification_pref`, `request_draft`,
`user_onboarding`, `session_two_step`, `email_outbox`, `rate_limit`, plus the Better Auth `user`
mapping. Better Auth's `twoFactor` table and `user.twoFactorEnabled` column are created by
`apply-schema.ts` (additive).

**Storage**, Cloudflare R2. The public bucket serves assets; `R2_PRIVATE_BUCKET` holds client
financial documents and deliverables, reachable only via ownership-checked presigned URLs. Backups
reuse the private bucket.

**Email**, all transactional mail goes through nodemailer over Truehost SMTP (`lib/email.ts`).
Without `SMTP_*` configured the app still works: unsent mail is logged to the console.

**Tax rates**, `lib/tax/nigeria-tax-config.json` is the single versioned source (NTA 2025: PAYE
bands, VAT, WHT, CIT + Development Levy, pension/NHF). `lib/calculators/*` and the LitchAI
compilers both read it. **Never hardcode a rate.**

---

## Getting started

### Prerequisites
- Node.js 24 (CI uses 24)
- Access to the CockroachDB cluster (or a Postgres-compatible equivalent)

### Installation

```bash
cd frontend
npm install
npm run dev                  # http://localhost:3000
```

### Environment

Next reads `frontend/.env*`, so **local dev uses `frontend/.env.local`**. Secrets live in Doppler
(`litch-consulting`) and the gitignored repo-root `.env`; `.env.local` is a copy of that.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | CockroachDB connection string (`…?sslmode=verify-full`) |
| `COCKROACH_CA_CERT` | Optional cluster CA PEM; otherwise `certs/cockroach-ca.crt` or system trust |
| `BETTER_AUTH_SECRET` | Auth signing secret (min 16 chars) |
| `BETTER_AUTH_URL` | **`http://localhost:3000` locally**, see the gotcha below |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional, Google sign-in is gated on both |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Transactional email |
| `CONTACT_TO_EMAIL` | Destination for contact-form submissions |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Cloudflare R2 credentials |
| `R2_BUCKET_NAME` / `R2_PUBLIC_DOMAIN` | Public bucket for assets |
| `R2_PRIVATE_BUCKET` | Private bucket, client documents, deliverables, backups |
| `PAYSTACK_MODE` (`test` \| `live`) | Picks the key pair below |
| `PAYSTACK_TEST_SECRET_KEY` / `PAYSTACK_TEST_PUBLIC_KEY` / `PAYSTACK_LIVE_SECRET_KEY` / `PAYSTACK_LIVE_PUBLIC_KEY` | Payments (legacy `PAYSTACK_SECRET_KEY` / `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` still read) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile on public forms (skipped when unset) |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin for pay links, emails, OG tags |
| `INVOICE_FROM_EMAIL` / `INVOICE_BANK_NAME` / `INVOICE_ACCOUNT_NAME` / `INVOICE_ACCOUNT_NUMBER` | Issuer details on invoices/receipts (optional overrides) |
| `NEXT_PUBLIC_CALCOM_LINK` / `CALCOM_WEBHOOK_SECRET` | Cal.com booking |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Admin web push (`npx web-push generate-vapid-keys`) |
| `CRON_SECRET` | Guards `/api/cron/*` and manual "Back up now" |
| `LITCHAI_API_URL` | LitchAI base URL, LitchAI features are gated on this |
| `LITCHAI_PUBLIC_KEY` | Blind-relay envelope encryption key (PEM; 
 escapes allowed) |
| `LITCHAI_ACCESS_CLIENT_ID` / `LITCHAI_ACCESS_CLIENT_SECRET` | Cloudflare Access service token |

### Seeded accounts

```bash
node --env-file=.env.local --import tsx scripts/seed-users.ts
```

Admins land on `/admin`, staff on `/work`, clients on `/dashboard` (after two-step setup for admin
and staff).

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Next dev server on port 3000 |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests (`src/**/*.test.ts`) |
| `npm run db:generate` | Generate Drizzle migration SQL |
| `npm run auth:migrate` | Migrate Better Auth tables (its own CLI) |
| `node --env-file=.env.local --import tsx scripts/apply-schema.ts` | **Apply schema**, see below |
| `node --env-file=.env.local --import tsx scripts/seed-users.ts` | Seed users |
| `node --env-file=.env.local scripts/vercel-sync-env.mjs` | Push env to Vercel |

---

## Schema workflow: `apply-schema.ts`, never `db:push`

**`drizzle-kit push` hangs** on CockroachDB introspection. A `db:push` script exists in
`package.json`; do not use it.

Apply DDL with `scripts/apply-schema.ts`, which issues idempotent
`CREATE TABLE IF NOT EXISTS …` statements. Extend it as the schema grows, then:

```bash
node --env-file=.env.local --import tsx scripts/apply-schema.ts
```

The cluster CA cert is at `certs/cockroach-ca.crt` (also read by the app and drizzle SSL
resolvers). Because local dev and production share the cluster, **applied changes are live
immediately**, no redeploy.

---

## Gotchas

- **Localhost logins.** If sign-in "succeeds" but bounces you back to `/login`, check that
  `.env.local` has `BETTER_AUTH_URL=http://localhost:3000`. An `https://…` value makes Better Auth
  issue **Secure** cookies that the browser drops on plain-HTTP localhost, so no session sticks and
  the middleware cookie check bounces you. Restart `npm run dev` after editing env.
- **Email verification is required to log in** (`requireEmailVerification: true`). For local
  signups without SMTP, grab the link from the dev-server terminal (`lib/email` logs unsent mail),
  or verify manually: `UPDATE "user" SET "emailVerified"=true WHERE email='…'`.
- **Google OAuth** works locally only if the Google console lists `http://localhost:3000` as a
  redirect origin.
- **PDF ₦ glyph.** Helvetica lacks the Naira sign, so the PDF registers **Noto Sans** from
  `lib/invoice/pdf/fonts/*.ttf`. `next.config.ts` `outputFileTracingIncludes` ships those fonts
  with the PDF serverless functions.
- **Dark mode.** Brand navy (`text-brand`) is invisible on dark surfaces, so `globals.css` flips
  it to white in dark mode, except elements marked `keep-brand` (white pills).
- **Tables.** The `DataTable` scroll container clips absolute menus, render row-action dropdowns
  in a **portal** (see `invoice-list.tsx`).
- **Charts across the RSC boundary.** Pass the serializable `format` token, not a formatter
  function.
- **Don't sync `BETTER_AUTH_URL` to Vercel**, Better Auth infers the URL from the request host in
  production.
- **Lint.** The experimental React-Compiler rules (`set-state-in-effect`, `purity`,
  `immutability`) are relaxed in `eslint.config.mjs`, false positives on RSC time reads, one-shot
  init effects, and tanstack `getState()`.

---

## House style

Reuse `components/ui/primitives.tsx`, `admin/ui/*`, and semantic Tailwind tokens (`bg-paper`,
`bg-cloud`, `bg-surface`, `text-ink`, `text-body`, `border-hairline`, `bg-brand`). Money renders
via `formatMoney`/`num`; dates via `lib/format-date`. Keep the invoice **preview** and **PDF**
visually in sync, same layout, watermark, stamp, signature. Keep `tsc`, lint and `build` green.

---

<div align="center">
  <p>Built by <a href="https://wedigcreativity.com.ng">WDC Solutions Hub</a></p>
  <p>&copy; 2026 Litch Consulting. All rights reserved.</p>
</div>
