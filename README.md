# Litch Consulting

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs&style=flat-square)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&style=flat-square)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&style=flat-square)
![Better Auth](https://img.shields.io/badge/Better_Auth-1.6-0a196d?style=flat-square)
![Drizzle](https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&style=flat-square)
![CockroachDB](https://img.shields.io/badge/CockroachDB-PostgreSQL-6933FF?logo=cockroachlabs&style=flat-square)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&style=flat-square)
![FastAPI](https://img.shields.io/badge/FastAPI-pipeline-009688?logo=fastapi&style=flat-square)
![pgvector](https://img.shields.io/badge/pgvector-RAG-4169E1?logo=postgresql&style=flat-square)
![Cloudflare R2](https://img.shields.io/badge/Cloudflare_R2-storage-F38020?logo=cloudflare&style=flat-square)
![Vercel](https://img.shields.io/badge/Vercel-deploy-000000?logo=vercel&style=flat-square)
![Oracle VM](https://img.shields.io/badge/Oracle_VM-LitchAI-F80000?logo=oracle&style=flat-square)

**Website + admin platform for a Nigerian professional finance firm.**

Litch Consulting delivers financial reporting, modelling, taxation, forensic accounting, data
analytics and advisory. This repository holds **two separately deployed applications**: the
web platform, a marketing site, a client portal, a staff workspace and an admin dashboard with
an invoicing engine, and **LitchAI**, a deterministic Python pipeline that compiles client
financial documents into formula-driven Excel deliverables.

- **Live:** https://www.litchconsulting.com (Vercel, deployed from `main` by a GitHub Actions workflow)
- **Repo:** https://github.com/Tee-David/litchconsulting (`main`)

---

## Two applications, two deploy targets

The single most important thing to understand about this repo: `frontend/` and `backend/` are
**not** a conventional web-app-plus-API pair. `frontend/` is a full-stack Next.js application
that owns its own data and needs no API server to run. `backend/` is an independent document
compiler and AI engine that only the web app reaches, on its own machine.

| | `frontend/` | `backend/` (LitchAI) |
| --- | --- | --- |
| What it is | Marketing site + client portal + staff workspace + admin + invoicing | Document → Excel compiler, workbench engine, Sage |
| Stack | Next.js 16, React 19, TypeScript | Python 3.12, FastAPI, openpyxl, DuckDB |
| Data | CockroachDB via Drizzle | Its own Postgres (pgvector + pg_trgm) |
| Deploys to | **Vercel** (push to `main`) | **Its own OCI VM**, never Vercel |
| Reached at | `www.litchconsulting.com` | `ai.litchconsulting.com`, via Cloudflare Tunnel |
| Runs without the other? | Yes, LitchAI features degrade gracefully | Yes, it is a standalone service |

```
                    +-----------------------------------+
                    |  Next.js 16 (App Router)          |
                    |  Vercel                           |
                    |                                   |
                    |  Marketing · Auth · Admin ·       |
                    |  Invoicing · Sage · PWA             |
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
                    |  llama-server (local model, 127.0.0.1)    |
                    +-------------------------------------------+
```

The VM binds the API to **loopback only**, the Cloudflare Tunnel is the sole ingress, so no
inbound ports are open. The frontend authenticates machine-to-machine with a Cloudflare Access
**service token**; there is no interactive login on that path.

### Components

| Concern | Technology |
| --- | --- |
| Framework | Next.js 16, React 19, TypeScript (strict) |
| Styling | Tailwind CSS v4 (CSS-first tokens), framer-motion |
| Auth | Better Auth (email/password + optional Google OAuth), roles `admin \| staff \| client`, two-step sign-in (required for admin and staff) |
| Database | CockroachDB (Postgres-compatible) |
| ORM | Drizzle (app tables); Better Auth owns the `user` table |
| Charts | Recharts wrappers (`components/charts/*`) |
| Tables | @tanstack/react-table (headless) + hand-rolled UI |
| Invoices/PDF | @react-pdf/renderer (Noto Sans for the ₦ glyph) |
| Email | nodemailer over Truehost SMTP |
| Storage | Cloudflare R2, public bucket for assets, private bucket for client documents |
| Payments | Paystack (redirect flow) |
| Booking | Cal.com embed |
| LitchAI | Python 3.12, FastAPI, openpyxl, Procrastinate, pgvector, DuckDB |
| AI models | Groq → Cloudflare Workers AI → Cerebras → SambaNova → local llama-server (masked; per-client local-only) |
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

**Three dashboards, three roles**
`/admin` for admins (requests, clients, billing, help desk, Sage, the workbench, settings, audit,
trash), `/work` for staff (only the requests assigned to them, never money amounts), and
`/dashboard` for clients (requests, quotes, payments, files, support). One access map in
`lib/access.ts` decides who can open what; every page and server action checks it on the server.
Invitations make staff and client-colleague accounts; two-step sign-in is enforced on the server
for admin and staff; Settings → Team and access manages roles and assignments.

**Analyses workbench**
A spreadsheet workbench at `/admin/analyses` (and `/work/analyses` for assigned files) where Sage
works beside the grid: it proposes changes as a diff the person accepts, edits or rejects, and
every accepted change is recomputed before it is saved.

**Sage**
An admin assistant at `/admin/sage` that answers grounded questions over a firm knowledge
base with citations, and *proposes* write actions that a human confirms before they execute. The
retrieval store is `knowledge_chunk` (pgvector HNSW + pg_trgm, fused with reciprocal-rank fusion).

**Deterministic document compilation**
LitchAI turns client financial documents into formula-driven `.xlsx` deliverables. The core rule:
**no generative step ever touches a formula**, compilers are hand-written Python, and a
headless-LibreOffice recompute plus golden fixtures gate every file before human review.

**Guided tours**
A cross-page tour engine (react-joyride) with route matching, target waiting, an animated
launcher, and confetti on completion, reduced-motion aware throughout.

**Operational safety nets**
Soft delete with a `/admin/trash` restore surface, an append-only audit log at `/admin/audit`,
nightly JSON backups to the private R2 bucket with an in-app restore test, an email outbox with
retries, NDPA erasure with a 30-day hold, a cookie notice and a data-processing register, and a
⌘K command palette for cross-entity search.

---

## Repo layout

```
litchconsulting/
├── frontend/                 The Next.js web platform, deploys to Vercel
│   ├── src/app/              Routes: marketing, (auth), invite, account, admin, work, dashboard, api, i/[token]
│   ├── src/components/       kit/, ui/, layout/, sections/, admin/, dashboard/, access/, auth/, tour/
│   ├── src/lib/              access, auth, server-user, two-step, invitations, email-templates, db, invoice, litchai
│   ├── scripts/              apply-schema, seed-users, vercel-sync-env, inspect-db
│   ├── certs/                CockroachDB cluster CA cert
│   └── README.md             → setup, env, schema workflow, gotchas
├── backend/                  LitchAI, deploys to its own OCI VM
│   ├── src/litchai/          compilers/, categorize/, ai/ (router, harness), workbench/, db/, ops/, review/
│   ├── tests/                golden-fixture suite (needs LibreOffice)
│   ├── deploy/               systemd units (api, worker, llama, backup, heartbeat), bootstrap, runbook
│   └── README.md             → setup, tests, API surface, VM deployment
└── CLAUDE.md                 Working guidance for Claude in this repo
```

---

## Quick start

The two applications are independent, you can run the web platform without LitchAI.

### Web platform

```bash
cd frontend
npm install
npm run dev                  # http://localhost:3000
```

Local dev reads `frontend/.env.local`; secrets come from Doppler (`litch-consulting`) or the
gitignored repo-root `.env`. **`BETTER_AUTH_URL` must be `http://localhost:3000` locally**, an
`https://…` value makes Better Auth issue Secure cookies that the browser drops on plain-HTTP
localhost, so logins silently fail. See [`frontend/README.md`](frontend/README.md).

### LitchAI

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/pytest             # golden-fixture suite, requires LibreOffice (`soffice`) on PATH
.venv/bin/ruff check src tests
```

See [`backend/README.md`](backend/README.md).

---

## Deployment

| App | Platform | Trigger |
| --- | --- | --- |
| `frontend/` | Vercel | Push to `main`: `.github/workflows/vercel-deploy.yml` deploys through the Vercel API (the Hobby plan blocks Git deploys from a private repo); `ci.yml` runs the checks |
| `backend/` | Oracle Cloud VM *WDC Projects*, `/srv/projects/litchconsulting` | systemd units (`litchai-api`, `litchai-worker`, `litchai-llama`, timers), **never Vercel** |

Env vars are managed in **Doppler** (`litch-consulting`) and synced to Vercel with
`scripts/vercel-sync-env.mjs`. Don't sync `BETTER_AUTH_URL`, Better Auth infers the URL from the
request host in production.

Because the web app and the live site share one CockroachDB cluster, **schema changes take effect
immediately once applied**, no redeploy needed. Apply them with `scripts/apply-schema.ts`, never
`drizzle-kit push` (it hangs on CockroachDB introspection).

Five Vercel cron jobs are declared in `frontend/vercel.json`, each guarded by `CRON_SECRET`:

| Path | Schedule (UTC) | Purpose |
| --- | --- | --- |
| `/api/cron/outbox` | `30 6 * * *` | Retry failed emails from the outbox (last 3 days, max 5 tries) |
| `/api/cron/sweep` | `0 7 * * *` | Purge Trash older than 30 days, run due client erasures, nudge unpaid requests, flag overdue quotes, clear rate-limit rows |
| `/api/cron/reminders` | `0 9 * * *` | Staged invoice due / overdue reminders |
| `/api/cron/backup` | `30 3 * * *` | Business tables → JSON snapshot in the private R2 bucket |
| `/api/cron/digest` | `0 8 * * 1` | Weekly client digest email (opt-out aware) |

GitHub Actions: `.github/workflows/ci.yml` runs on every push and pull request (frontend types,
lint errors and unit tests; backend ruff error gate and pytest with LibreOffice).
`vercel-deploy.yml` deploys `main`.

---

## Tax rates, one source of truth

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
