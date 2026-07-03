# CLAUDE.md — Litch Consulting

Guidance for Claude when working in this repository.

## What this is

**Litch Consulting** — website + admin platform for a Nigerian professional finance firm
(financial reporting, modelling, taxation, forensic accounting, data analytics, advisory).
A polished marketing site **and** a role-gated admin dashboard with an invoicing engine.

- Live: https://www.litchconsulting.com (Vercel, auto-deploys `main`)
- Repo: https://github.com/Tee-David/litchconsulting (`main`)
- The whole app lives in **`frontend/`** (Next.js full-stack). `backend/` is an empty placeholder.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 (CSS-first tokens in
`globals.css`) · framer-motion · Better Auth · Drizzle + CockroachDB · Cloudflare R2 ·
nodemailer (SMTP) + Resend · @react-pdf/renderer · @tanstack/react-table · Doppler · Vercel.

## Data & services

- **Reads:** admin pages are RSCs querying **Drizzle** directly (`lib/db/queries/*`).
  Better Auth's `user` table is read via the `pg` Pool, never added to the Drizzle schema.
- **Writes:** **server actions** (`app/admin/**/actions.ts`), each guarded by `isAdmin()`.
  Money totals are always recomputed server-side (`lib/invoice/money.ts`).
- **Auth:** Better Auth (`lib/auth.ts`), roles `admin | client` on the session user.
  `lib/server-user.ts` has `getSessionUser/isAdmin`. Admin gate in `app/admin/layout.tsx`;
  `/dashboard` redirects admins → `/admin`.
- **Schema:** `lib/db/schema.ts` — `lead, client, invoice, invoice_item, org_settings`.
- **Invoicing:** builder (`components/admin/invoice/invoice-builder.tsx`) → live HTML preview
  (`invoice-preview.tsx`) → branded PDF (`lib/invoice/pdf/InvoiceDocument.tsx`, `render.ts`) →
  SMTP send + public `/i/[token]` pay page. Receipts reuse the PDF with `variant="receipt"`.

## Gotchas / conventions

- **`drizzle-kit push` HANGS** on CockroachDB introspection. Apply schema changes with
  `scripts/apply-schema.ts` (`CREATE TABLE IF NOT EXISTS …`). Extend it as the schema grows,
  then run `node --env-file=.env.local --import tsx scripts/apply-schema.ts`. The CA cert is
  at `frontend/certs/cockroach-ca.crt` (also read by the app/drizzle SSL resolvers).
- **Env:** secrets live in the repo-root `.env` (gitignored) + **Doppler** (`litch-consulting`).
  Next reads `frontend/.env*`, so local dev uses `frontend/.env.local` (a copy of `.env`).
  Sync to Vercel with `scripts/vercel-sync-env.mjs`. Don't sync `BETTER_AUTH_URL` (localhost)
  — Better Auth infers the URL from the request host in prod.
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
cd frontend
npm run dev | build | start | lint
npm run db:generate                                             # generate migration SQL
node --env-file=.env.local --import tsx scripts/apply-schema.ts # apply schema (NOT db:push)
node --env-file=.env.local --import tsx scripts/seed-users.ts   # seed users
node --env-file=.env.local scripts/vercel-sync-env.mjs          # push env to Vercel
```

## Deploy

Push to `main` → Vercel. Shared CockroachDB → schema changes (via `apply-schema.ts`) take
effect on the live app immediately; no redeploy needed for data/schema.

## House style

Match the surrounding code. Reuse `components/ui/primitives.tsx`, `admin/ui/*`, semantic
Tailwind tokens (`bg-paper/cloud/surface`, `text-ink/body`, `border-hairline`, `bg-brand`).
Keep the invoice **preview** and **PDF** visually in sync (same layout, watermark, stamp,
signature). Push after meaningful chunks; keep `tsc`, lint, and `build` green.
