# Litch Consulting

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs&style=flat-square)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&style=flat-square)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&style=flat-square)
![Better Auth](https://img.shields.io/badge/Better_Auth-1.6-0a196d?style=flat-square)
![Drizzle](https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&style=flat-square)
![CockroachDB](https://img.shields.io/badge/CockroachDB-PostgreSQL-6933FF?logo=cockroachlabs&style=flat-square)
![Cloudflare R2](https://img.shields.io/badge/Cloudflare_R2-storage-F38020?logo=cloudflare&style=flat-square)
![react-pdf](https://img.shields.io/badge/react--pdf-invoicing-fb5b5b?style=flat-square)
![PWA](https://img.shields.io/badge/PWA-installable_+_offline-5A0FC8?style=flat-square)
![Vercel](https://img.shields.io/badge/Vercel-deploy-000000?logo=vercel&style=flat-square)

**Website + admin platform for a Nigerian professional finance firm.**

Litch Consulting delivers financial reporting, modelling, taxation, forensic accounting,
data analytics and advisory. This repo is the full-stack Next.js app: a polished marketing
site (services, case studies, insights, contact/booking, legal) **and** a role-gated admin
dashboard with an invoicing engine — a split-view builder with a live branded preview,
`@react-pdf` documents (with a ₦-capable font), SMTP delivery, a public pay page, receipts,
comprehensive filterable tables, analytics, and a PWA (installable + offline).

- **Live:** https://www.litchconsulting.com (Vercel, auto-deploys `main`)
- **Repo:** https://github.com/Tee-David/litchconsulting (`main`)

---

## Architecture

Full-stack Next.js (App Router) — there is no separate backend service. Reads are React
Server Components querying Drizzle directly; writes are `isAdmin()`-guarded **server actions**.

```
                    +-------------------------------+
                    |  Next.js 16 (App Router)       |
                    |  Vercel                        |
                    |                                |
                    |  Marketing site · Auth ·       |
                    |  Admin dashboard · Invoicing · |
                    |  PWA (SW + manifest)           |
                    +---+--------+---------+---------+
                        |        |         |
              Better Auth   Drizzle ORM   R2 client / SMTP
                        |        |         |
        +---------------v-+  +---v--------+ +--v-----------+
        | CockroachDB      |  | (app tables)| | Cloudflare R2 |
        | user/session/... |  | invoice ... | | + Truehost    |
        | (Better Auth CLI)|  | (Drizzle)   | |   SMTP        |
        +------------------+  +-------------+ +--------------+
```

### Components

| Concern        | Technology                                            |
| -------------- | ----------------------------------------------------- |
| Framework      | Next.js 16, React 19, TypeScript (strict)             |
| Styling        | Tailwind CSS v4 (CSS-first tokens), framer-motion      |
| Auth           | Better Auth (email/password + optional Google OAuth)  |
| Database       | CockroachDB (Postgres-compatible)                     |
| ORM            | Drizzle (app tables) + Better Auth CLI (auth tables)  |
| Tables (admin) | @tanstack/react-table (headless) + hand-rolled UI     |
| Invoices/PDF   | @react-pdf/renderer (Noto Sans for ₦), qr later        |
| Exports        | xlsx, jspdf + jspdf-autotable, hand-rolled CSV        |
| Email          | nodemailer over Truehost SMTP; Resend for contact form |
| Storage        | Cloudflare R2 (S3 API) for uploads/assets             |
| Secrets        | Doppler (`litch-consulting` project)                  |
| Deploy         | Vercel                                                |

---

## Repo layout

```
litchconsulting/
├── frontend/            The Next.js app — THE PRODUCT
│   ├── src/app/         Routes: marketing, (auth), admin, dashboard, api, i/[token]
│   ├── src/components/  ui/, layout/, sections/, auth/, admin/ (+ admin/ui, admin/invoice)
│   ├── src/lib/         auth, server-user, db (schema+client+queries), invoice/*, email, r2
│   ├── scripts/         seed-users, apply-schema, vercel-sync-env
│   └── drizzle/         generated SQL migrations
├── backend/             placeholder (empty) — app is self-contained
└── .env                 secrets source (gitignored) — synced to Doppler
```

---

## Getting started

```bash
cd frontend
npm install
cp ../.env .env.local        # local env for `next dev` (Next reads frontend/.env*)
npm run dev                  # http://localhost:3000
```

Seeded accounts (via `scripts/seed-users.ts`): `admin@litchconsulting.com` /
`client@litchconsulting.com` (password `Password123!`). Admins land on `/admin`, clients on
`/dashboard`.

### Scripts

| Command                                                            | What it does                              |
| ------------------------------------------------------------------ | ----------------------------------------- |
| `npm run dev` / `build` / `start`                                  | Next dev / production build / serve       |
| `npm run lint`                                                     | ESLint                                    |
| `npm run db:generate`                                              | Generate Drizzle migration SQL            |
| `node --env-file=.env.local --import tsx scripts/apply-schema.ts`  | **Apply schema** (see gotcha below)       |
| `node --env-file=.env.local --import tsx scripts/seed-users.ts`    | Seed the initial users                    |
| `npm run auth:migrate`                                             | Migrate Better Auth tables (its CLI)      |

> **Schema gotcha:** `drizzle-kit push` **hangs** on CockroachDB introspection. Apply DDL
> with `scripts/apply-schema.ts` (`CREATE TABLE IF NOT EXISTS …`) instead. It uses the
> cluster CA cert at `frontend/certs/cockroach-ca.crt`.

---

## Deployment

Push to `main` → Vercel builds and deploys. Env vars are managed in **Doppler**
(`litch-consulting`) and synced to Vercel with `scripts/vercel-sync-env.mjs`. The shared
CockroachDB means schema changes apply instantly to the live app once run via `apply-schema.ts`.

---

_Built by W.D.C Solutions Hub._
