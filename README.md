# Litch Consulting

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs&style=flat-square)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&style=flat-square)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&style=flat-square)
![Better Auth](https://img.shields.io/badge/Better_Auth-1.6-0a196d?style=flat-square)
![Drizzle](https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&style=flat-square)
![CockroachDB](https://img.shields.io/badge/CockroachDB-PostgreSQL-6933FF?logo=cockroachlabs&style=flat-square)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&style=flat-square)
![FastAPI](https://img.shields.io/badge/FastAPI-pipeline-009688?logo=fastapi&style=flat-square)
![pgvector](https://img.shields.io/badge/pgvector-RAG-4169E1?logo=postgresql&style=flat-square)
![Cloudflare R2](https://img.shields.io/badge/Cloudflare_R2-storage-F38020?logo=cloudflare&style=flat-square)
![Vercel](https://img.shields.io/badge/Vercel-deploy-000000?logo=vercel&style=flat-square)
![Oracle VM](https://img.shields.io/badge/Oracle_VM-LitchAI-F80000?logo=oracle&style=flat-square)

**Website + admin platform for a Nigerian professional finance firm.**

Litch Consulting delivers financial reporting, modelling, taxation, forensic accounting, data
analytics and advisory. This repository holds **two separately deployed applications**: the
client-facing web platform — a polished marketing site *and* a role-gated admin dashboard with
an invoicing engine — and **LitchAI**, a deterministic Python pipeline that compiles client
financial documents into formula-driven Excel deliverables.

- **Live:** https://www.litchconsulting.com (Vercel, auto-deploys `main`)
- **Repo:** https://github.com/Tee-David/litchconsulting (`main`)

---

## Two applications, two deploy targets

The single most important thing to understand about this repo: `frontend/` and `backend/` are
**not** a conventional web-app-plus-API pair. `frontend/` is a full-stack Next.js application
that owns its own data and needs no API server to run. `backend/` is an independent document
compiler that only the admin ever reaches, on its own machine.

| | `frontend/` | `backend/` (LitchAI) |
| --- | --- | --- |
| What it is | Marketing site + admin dashboard + invoicing | Financial-document → Excel compiler |
| Stack | Next.js 16, React 19, TypeScript | Python 3.11+, FastAPI, openpyxl |
| Data | CockroachDB via Drizzle | Its own Postgres (pgvector + pg_trgm) |
| Deploys to | **Vercel** (push to `main`) | **Its own OCI VM** — never Vercel |
| Reached at | `www.litchconsulting.com` | `ai.litchconsulting.com`, via Cloudflare Tunnel |
| Runs without the other? | Yes — LitchAI features degrade gracefully | Yes — it is a standalone service |

```
                    +-----------------------------------+
                    |  Next.js 16 (App Router)          |
                    |  Vercel                           |
                    |                                   |
                    |  Marketing · Auth · Admin ·       |
                    |  Invoicing · Copilot UI · PWA     |
                    +--+--------+---------+---------+---+
                       |        |         |         |
             Better Auth   Drizzle    R2 / SMTP   server-only
                       |        |         |       LitchAI client
        +--------------v-+  +---v-------+ +-v----------+   |
        | CockroachDB     |  | app tables| | Cloudflare |   |
        | user/session    |  | invoice … | | R2 + SMTP  |   |
        | (Better Auth)   |  | (Drizzle) | |            |   |
        +-----------------+  +-----------+ +------------+   |
                                                            |
                                    Cloudflare Access service token
                                       (+ blind-relay envelope)
                                                            |
                    +---------------------------------------v---+
                    |  Cloudflare Tunnel → ai.litchconsulting.com|
                    +---------------------+---------------------+
                                          |
                    +---------------------v---------------------+
                    |  Oracle Cloud VM (OCI)                    |
                    |  litchai-api (FastAPI, 127.0.0.1:8000)    |
                    |  litchai-worker (Procrastinate)           |
                    |  Postgres: pgvector + pg_trgm             |
                    +-------------------------------------------+
```

The VM binds the API to **loopback only** — the Cloudflare Tunnel is the sole ingress, so no
inbound ports are open. The frontend authenticates machine-to-machine with a Cloudflare Access
**service token**; there is no interactive login on that path.

### Components

| Concern | Technology |
| --- | --- |
| Framework | Next.js 16, React 19, TypeScript (strict) |
| Styling | Tailwind CSS v4 (CSS-first tokens), framer-motion |
| Auth | Better Auth (email/password + optional Google OAuth), roles `admin \| client` |
| Database | CockroachDB (Postgres-compatible) |
| ORM | Drizzle (app tables); Better Auth owns the `user` table |
| Charts | Recharts wrappers (`components/charts/*`) |
| Tables | @tanstack/react-table (headless) + hand-rolled UI |
| Invoices/PDF | @react-pdf/renderer (Noto Sans for the ₦ glyph) |
| Email | nodemailer over Truehost SMTP |
| Storage | Cloudflare R2 — public bucket for assets, private bucket for client documents |
| Payments | Paystack (redirect flow) |
| Booking | Cal.com embed |
| LitchAI | Python 3.11+, FastAPI, openpyxl, Procrastinate, pgvector |
| Secrets | Doppler (`litch-consulting`) |
| Deploy | Vercel (web) · Oracle Cloud VM (LitchAI) |

---

## Key capabilities

**Marketing site**
Services, case studies, insights, contact/booking, legal pages, and twelve Nigerian finance
calculators (PAYE, CIT, VAT, WHT, stamp duty, import duty, salary, reverse salary, pension, loan,
mortgage, compound interest) driven by a single versioned rate config.

**Invoicing engine**
Split-view builder → live HTML preview → branded PDF → SMTP delivery → public `/i/[token]` pay
page with Paystack. Receipts reuse the same document with `variant="receipt"`, so preview and PDF
never drift. Money totals are always recomputed server-side.

**Admin dashboard**
Requests pipeline, clients, finance (invoices, quotes, receipts, accounting, models), reports,
blog, templates, LitchAI review, integrations, help desk and settings — all reads are React Server
Components querying Drizzle directly; all writes are `isAdmin()`-guarded server actions.

**LitchAI Copilot**
An admin assistant at `/admin/assistant` that answers grounded questions over a firm knowledge
base with citations, and *proposes* write actions that a human confirms before they execute. The
retrieval store is `knowledge_chunk` (pgvector HNSW + pg_trgm, fused with reciprocal-rank fusion).

**Deterministic document compilation**
LitchAI turns client financial documents into formula-driven `.xlsx` deliverables. The core rule:
**no generative step ever touches a formula** — compilers are hand-written Python, and a
headless-LibreOffice recompute plus golden fixtures gate every file before human review.

**Guided tours**
A cross-page tour engine (react-joyride) with route matching, target waiting, an animated
launcher, and confetti on completion — reduced-motion aware throughout.

**Operational safety nets**
Soft delete with a `/admin/trash` restore surface, an append-only audit log at `/admin/audit`,
nightly R2 database backups with rotation, a weekly client digest with opt-out, and a ⌘K command
palette for cross-entity search.

---

## Repo layout

```
litchconsulting/
├── frontend/                 The Next.js web platform — deploys to Vercel
│   ├── src/app/              Routes: marketing, (auth), admin, dashboard, api, i/[token]
│   ├── src/components/       ui/, layout/, sections/, admin/, charts/, tour/, calculators/
│   ├── src/lib/              auth, server-user, db (schema+queries), invoice/*, litchai/*, audit
│   ├── scripts/              apply-schema, seed-users, vercel-sync-env, inspect-db
│   ├── certs/                CockroachDB cluster CA cert
│   └── README.md             → setup, env, schema workflow, gotchas
├── backend/                  LitchAI — deploys to its own OCI VM
│   ├── src/litchai/          compilers/, categorize/, ai/, db/, ops/, extraction/, validation/
│   ├── tests/                golden-fixture suite (needs LibreOffice)
│   ├── deploy/               systemd units, backup script, ops runbook
│   └── README.md             → setup, tests, API surface, VM deployment
└── CLAUDE.md                 Working guidance for Claude in this repo
```

---

## Quick start

The two applications are independent — you can run the web platform without LitchAI.

### Web platform

```bash
cd frontend
npm install
npm run dev                  # http://localhost:3000
```

Local dev reads `frontend/.env.local`; secrets come from Doppler (`litch-consulting`) or the
gitignored repo-root `.env`. **`BETTER_AUTH_URL` must be `http://localhost:3000` locally** — an
`https://…` value makes Better Auth issue Secure cookies that the browser drops on plain-HTTP
localhost, so logins silently fail. See [`frontend/README.md`](frontend/README.md).

### LitchAI

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/pytest             # golden-fixture suite — requires LibreOffice (`soffice`) on PATH
```

See [`backend/README.md`](backend/README.md).

---

## Deployment

| App | Platform | Trigger |
| --- | --- | --- |
| `frontend/` | Vercel | Push to `main` (Vercel's git integration) |
| `backend/` | Oracle Cloud VM | Deployed on the VM via systemd units (`litchai-api`, `litchai-worker`) — **never Vercel** |

Env vars are managed in **Doppler** (`litch-consulting`) and synced to Vercel with
`scripts/vercel-sync-env.mjs`. Don't sync `BETTER_AUTH_URL` — Better Auth infers the URL from the
request host in production.

Because the web app and the live site share one CockroachDB cluster, **schema changes take effect
immediately once applied** — no redeploy needed. Apply them with `scripts/apply-schema.ts`, never
`drizzle-kit push` (it hangs on CockroachDB introspection).

Three Vercel cron jobs are declared in `frontend/vercel.json`, each guarded by `CRON_SECRET`:

| Path | Schedule | Purpose |
| --- | --- | --- |
| `/api/cron/sweep` | `0 7 * * *` | Purge soft-deleted rows older than 30 days |
| `/api/cron/backup` | `30 3 * * *` | CockroachDB → private R2 bucket, with rotation |
| `/api/cron/digest` | `0 8 * * 1` | Weekly client digest email (opt-out aware) |

---

## Tax rates — one source of truth

`frontend/src/lib/tax/nigeria-tax-config.json` is the **single versioned source** of Nigerian tax
rates (NTA 2025: PAYE bands, VAT, WHT, CIT + Development Levy, pension/NHF). The site calculators
and the LitchAI compilers both read it. **Never hardcode a rate** in either application.

---

## License

Proprietary software. Internal use for Litch Consulting and approved affiliates only.
Distribution or reproduction without express permission is prohibited.

---

<div align="center">
  <p>Built by <a href="https://wedigcreativity.com.ng">WDC Solutions Hub</a></p>
  <p>&copy; 2026 Litch Consulting. All rights reserved.</p>
</div>
