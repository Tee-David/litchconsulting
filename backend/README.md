# LitchAI — backend

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&style=flat-square)
![FastAPI](https://img.shields.io/badge/FastAPI-API-009688?logo=fastapi&style=flat-square)
![openpyxl](https://img.shields.io/badge/openpyxl-formula_compiler-1D6F42?style=flat-square)
![Procrastinate](https://img.shields.io/badge/Procrastinate-queue-4B8BBE?style=flat-square)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector_+_pg__trgm-4169E1?logo=postgresql&style=flat-square)
![Ruff](https://img.shields.io/badge/Ruff-lint-D7FF64?logo=ruff&style=flat-square)
![Pytest](https://img.shields.io/badge/Pytest-golden_fixtures-0A9EDC?logo=pytest&style=flat-square)
![Oracle VM](https://img.shields.io/badge/Oracle_VM-deploy-F80000?logo=oracle&style=flat-square)

**LitchAI compiles client financial documents into formula-driven Excel deliverables.**

A client sends in ledgers, bank statements, payroll schedules or trial balances. LitchAI ingests
them, extracts and categorises every line item, and emits an `.xlsx` file in which **every
computed cell is a real Excel formula** — an auditable working paper, not a flat dump of numbers.

> **Core rule: no generative step ever touches a formula.**
> Compilers are hand-written Python. A headless-LibreOffice recompute plus golden fixtures gate
> every file before it reaches human review. The LLM's role is confined to categorisation
> suggestions, the grounded Sage assistant and workbench proposals that a person accepts and
> that are recomputed before saving — never to unchecked arithmetic.

This is a **standalone service**. It deploys to its own Oracle Cloud (OCI) VM and is **never**
deployed to Vercel. The web platform in `frontend/` reaches it only through a Cloudflare Tunnel,
authenticated with a Cloudflare Access service token.

Nigerian tax rates come from the shared config at `frontend/src/lib/tax/nigeria-tax-config.json` —
the same file the site calculators use, loaded here by `src/litchai/taxconfig.py`. **Never hardcode
a rate.**

---

## Setup

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
```

### Tests

```bash
.venv/bin/pytest
```

CI (`.github/workflows/ci.yml`) runs the same suite on Python 3.12 with `libreoffice-calc-nogui`,
and gates on `ruff check --select E9,F63,F7,F82` (real errors); the wider lint backlog is reported
but does not fail the build.

The recompute tests require **LibreOffice** (`soffice`) on `PATH` — that binary is what proves the
emitted formulas actually evaluate to the expected values.

### Lint

```bash
.venv/bin/ruff check src tests
```

### Extras

| Extra | Contents | Where |
| --- | --- | --- |
| `dev` | pytest, ruff, httpx | Everywhere |
| `vm` | `clamd` (ClamAV INSTREAM malware scan), `docling` (layout-aware OCR + table extraction) | **VM only** — heavy/native deps the pure-Python test suite doesn't need |

---

## How a document becomes a deliverable

```
upload → malware scan → extraction → normalize → categorize (4-rung ladder)
       → human review queue → contract (fixed schema) → compiler (hand-written Python)
       → LibreOffice recompute gate → golden-fixture check → generated file
```

### The categorisation ladder

`src/litchai/categorize/ladder.py` resolves each line item down a cost-ordered ladder, stopping at
the first rung that clears both its similarity and weighted-vote thresholds:

| Rung | Method | Thresholds |
| --- | --- | --- |
| 1 | Normalised exact match | vote ≥ `0.9` |
| 2 | `pg_trgm` trigram similarity | sim ≥ `0.55`, vote ≥ `0.6` |
| 3 | `pgvector` nearest-neighbour | cos ≥ `0.82`, vote ≥ `0.6` |
| 4 | LLM classification | fallback only |

Unresolved items land in **suspense** for a human. Every decision records its `category_source`
(`exact | trigram | vector | llm | human`), so the rung hit-rates and the rung-4 fallback rate are
observable — see `GET /observability`.

### Compilers

`src/litchai/compilers/` — hand-written, one per template:
`annual_report/` (IAS 1 + IFRS 18), `ar_ap_aging`, `bank_rec`, `cac_tracker`, `cashflow`, `cit`,
`ledger`, `payroll`, `pnl`, `statement_of_affairs`, `vat`, `wht`.

`generated_files` records the compiler, contract-schema, taxonomy, tax-config and recompute-engine
versions for every file produced, so any deliverable can be traced to the exact code that made it.

### Sage RAG

`knowledge_chunk` (pgvector HNSW + `pg_trgm` GIN, scope/client filtered) backs the admin assistant (Sage).
`src/litchai/categorize/retrieval.py` fuses vector and trigram hits with reciprocal-rank fusion and
resolves parent documents. `POST /assistant/chat` runs a two-stage router — semantic tool select,
then constrained slot extraction — and returns a grounded answer with citations. **Read tools
return data; write tools return a proposal only and are never executed here** — the frontend
confirms them with a human first.

Some read tools need data that lives in the web app's database (billing and transfer proofs,
client privacy, request asks / review rounds / assignment, backups). For those the engine returns
`needs_app_data: {tool, slots, client_id}` when the caller sent `app_tools: true`; the
admin-guarded `/api/sage` relay runs the read and calls again with `app_data: {tool, data}`, and
the answer is grounded on it. A caller without `app_tools` gets the knowledge-base answer instead.

Ingestion is a CLI (the same work `POST /knowledge/reindex` does):

```bash
.venv/bin/python -m litchai.knowledge reindex               # rebuild from the seed corpus
.venv/bin/python -m litchai.knowledge reindex --corpus-dir /path/to/corpus
```

---

## API surface

The API binds to **loopback only** (`127.0.0.1:8000`); the Cloudflare Tunnel is the sole ingress.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness probe |
| `GET` | `/health/queue` | Procrastinate queue health |
| `POST` | `/documents` | Ingest a document (201) |
| `GET` | `/documents` | List documents |
| `GET` | `/documents/{id}` | Document status + progress |
| `GET` | `/documents/{id}/review` | Review queue for a document |
| `POST` | `/documents/{id}/lines/{line_item_id}/recategorize` | Human correction |
| `GET` | `/taxonomy` | Category taxonomy |
| `POST` | `/engagements/{id}/submit` | Submit for approval |
| `POST` | `/engagements/{id}/approve` | Approve |
| `POST` | `/engagements/{id}/reject` | Reject |
| `POST` | `/engagements/{id}/lock` | Lock |
| `POST` | `/engagements/{id}/reopen` | Reopen |
| `POST` | `/engagements/{id}/compile` | Compile deliverables |
| `POST` | `/engagements/{id}/ask` | Engagement-scoped question |
| `POST` | `/assistant/chat` | Sage — grounded answer + citations + tool proposals |
| `POST` | `/knowledge/reindex` | Rebuild the firm-global RAG store |
| `GET` | `/observability` | Status counts, rung hit-rates, fallback rate |
| `POST` | `/clients/{id}/erase` | NDPA right-to-erasure |

---

## Layout

```
backend/
├── src/litchai/
│   ├── api.py                 FastAPI app — all routes above
│   ├── pipeline.py queue.py   Orchestration + Procrastinate tasks
│   ├── taxconfig.py           Loads the shared tax config from the repo checkout
│   ├── crypto.py              Blind-relay envelope decrypt
│   ├── knowledge.py           Sage RAG ingestion CLI
│   ├── embeddings.py          Embedding client
│   ├── sanitize.py scanning.py storage.py seed.py fixtures_gen.py
│   ├── contracts/             Fixed structured-input schemas, one per template
│   ├── compilers/             Hand-written template compilers
│   ├── validation/            LibreOffice recompute gate
│   ├── extraction/ mapping/   Document extraction + account mapping
│   ├── categorize/            Ladder, memory store, retrieval, LLM, eval, reports
│   ├── ai/                    assistant.py, harness.py, provider.py, cache.py, prompts/
│   ├── documents/             Document + engagement state machines
│   ├── review/                Human review queue
│   ├── taxonomy/              Category taxonomy data
│   └── db/                    schema.sql, repo.py, pg.py, memory.py, apply_schema.py
├── tests/                     37 test modules — golden fixtures + API + pipeline
├── fixtures/synthetic/        Golden fixtures for automated tests
├── fixtures/real/             Anonymised client samples (gitignored, never committed)
└── deploy/                    systemd units, backup script, RUNBOOK.md
```

---

## AI models (router)

`litchai/ai/router.py` keeps one provider chain behind a single interface. Default order
(override with `LITCHAI_PROVIDER_CHAIN`):

| Order | Provider | Model | Env |
| --- | --- | --- | --- |
| 1 | Groq | `openai/gpt-oss-120b` | `GROQ_API_KEY` |
| 2 | Cloudflare Workers AI | `@cf/openai/gpt-oss-120b` | `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` (or `LITCHAI_CF_AI_TOKEN`) |
| 3 | Cerebras | `gpt-oss-120b` | `CEREBRAS_API_KEY` |
| 4 | SambaNova | `Meta-Llama-3.3-70B-Instruct` | `SAMBANOVA_API_KEY` |
| 5 | Local | llama-server (`LITCHAI_LLAMA_SERVER_URL`), else Ollama (`LITCHAI_OLLAMA_HOST`) | `LITCHAI_LOCAL_MODEL` |

The router pins one provider per conversation and falls back on timeout, rate limit, daily quota
(`LITCHAI_<PROVIDER>_DAILY_REQUESTS/_TOKENS`) or invalid output, recording the reason. Every cloud
call is masked first; clients set to **local only** never leave the VM. Every call is logged.

## Deployment — Oracle Cloud VM

LitchAI runs on the **WDC Projects** OCI VM under systemd, from `/srv/projects/litchconsulting`
(one folder per project on that host). It is **never** deployed to Vercel. `deploy/bootstrap.sh`
rebuilds the host from a blank Ubuntu 24.04 ARM image.

| Unit | Runs |
| --- | --- |
| `litchai-api.service` | `uvicorn litchai.api:app --host 127.0.0.1 --port 8000` |
| `litchai-worker.service` | `procrastinate --app=litchai.queue.queue worker` |
| `litchai-llama.service` | llama.cpp `llama-server` on 127.0.0.1:8081 (Q4_0 model, niced, no CPU quota) |
| `litch-cloudflared.service` | Cloudflare Tunnel for `ai.litchconsulting.com` |
| `litchai-backup.timer` | `deploy/backup.sh` — nightly `pg_dump` → R2 (02:30 UTC) |
| `litchai-heartbeat.timer` | `litchai.heartbeat` every 10 min — OCI idle-reclaim guard |

Install a unit by copying it to `/etc/systemd/system/`, then `daemon-reload` and
`systemctl enable --now <unit>`. Every unit starts through `litch-run`, which injects secrets from
Doppler (read-only service token) and host settings from `/etc/litch/env`.

Queue state lives in Postgres, so a VM restart loses nothing — the worker resumes and long scans
pick up from the last completed extraction chunk (re-runs are idempotent).

### How it's reached

```
frontend (Vercel)  ──CF-Access-Client-Id/Secret──▶  ai.litchconsulting.com
                                                      │  Cloudflare Tunnel
                                                      ▼
                                            127.0.0.1:8000 (loopback only)
```

- **No inbound ports are open** on the VM. The Cloudflare Tunnel is the only ingress.
- A Cloudflare **Access** application guards the hostname with a non-identity policy; the frontend
  authenticates machine-to-machine with a **service token** (`CF-Access-Client-Id` /
  `CF-Access-Client-Secret`) — no interactive login on that path.
- Client document uploads travel as a **blind-relay envelope**: Vercel forwards ciphertext and
  never holds a usable plaintext or decrypt key. The private key sits `0600` root-owned on the VM
  at `/etc/litch/blind-relay.key` (root-owned, group-readable by the service user), wired in via
  `LITCHAI_PRIVATE_KEY_PATH`.

### Environment (Doppler + `/etc/litch/env`)

| Variable | Purpose |
| --- | --- |
| `LITCHAI_DATABASE_URL` | Postgres (needs the `vector` and `pg_trgm` extensions) |
| `LITCHAI_PRIVATE_KEY_PATH` | Blind-relay decrypt key on disk |
| `R2_BUCKET` | Private R2 bucket for backups |
| `GROQ_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CEREBRAS_API_KEY`, `SAMBANOVA_API_KEY` | Cloud model providers (see AI models) |
| `LITCHAI_LLAMA_SERVER_URL`, `LITCHAI_LOCAL_MODEL`, `LITCHAI_OLLAMA_HOST` | Local model and embeddings |
| `LITCHAI_PROVIDER_CHAIN` | Optional chain override |

Backups use the Litch-scoped R2 S3 credentials from Doppler; `backup.sh` builds the `rclone`
remote `r2:` from them at runtime (no credentials file on disk).

Access to the VM and the OCI tenancy is described by variables in the gitignored repo-root
`.env`, named `WDC_VM_*` (host name, IP, user, instance OCID, SSH key file) and `WDC_OCI_*` (tenancy,
user, region, compartment, VCN/subnet, API key fingerprint and key file). Never paste their values
into docs, commits or tickets.

---

## Operations

`deploy/RUNBOOK.md` is the operational reference — backups, the quarterly restore drill, queue
resilience, the idle-reclaim heartbeat, and NDPA retention/erasure.

**Backups** — nightly `pg_dump` (custom format) → private R2 bucket, pruned grandfather-father-son
(7 daily / 4 weekly / 6 monthly) by `litchai.ops.backup.select_for_deletion`.

**Audit trail** — every document and engagement state transition is written to `audit_log` by the
state machines (`documents/state.py`, `documents/engagement_state.py`). No bare status updates
exist in the code.

**Right to erasure (NDPA)** — `POST /clients/{id}/erase` (or `litchai.ops.erasure.erase_client`)
deletes the client's documents and cascading rows, engagements and generated files; deletes
client-scoped `category_memory`; and flags firm-global memory rows carrying that client's narration
text `stale = true` for operator review. It returns per-entity counts for the erasure record.

**Observability** — `GET /observability`, surfaced in the admin UI at
`/admin/analyses/observability`. Richer SQL views (most-corrected categories, still-confusing
narrations, LLM usage) live in `litchai.categorize.reports.SQL_VIEWS`.

---

<div align="center">
  <p>Built by <a href="https://wedigcreativity.com.ng">WDC Solutions Hub</a></p>
  <p>&copy; 2026 Litch Consulting. All rights reserved.</p>
</div>
