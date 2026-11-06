# LitchAI Operations Runbook (Phase 6)

Hardening procedures for the **WDC Projects** OCI VM (web3aether tenancy, Frankfurt).

## Host layout

One folder per project under `/srv/projects/<name>`, each run by its own system user.
LitchAI lives in `/srv/projects/litchconsulting` (`app/` checkout, `venv/`, `data/uploads/`
ciphertext, `backups/`) and runs as user `litch`. Secrets are injected at start by
`litch-run` (`doppler run`, read-only service token in `/etc/litch/doppler.env`); host-local
settings sit in `/etc/litch/env`. Postgres 16 + pgvector, ClamAV, Ollama (embeddings) and
llama-server (local chat model) are native, loopback-only services. `deploy/bootstrap.sh` rebuilds the whole host from a blank image.

Run anything as the app: `sudo -u litch /usr/local/bin/litch-run <cmd>` (from a dir litch can read, e.g. `cd /tmp`).

Access to the VM and the OCI tenancy is described by variables in the gitignored repo-root
`.env`, named `WDC_VM_*` (host name, IP, user, instance OCID, SSH key file) and `WDC_OCI_*` (tenancy,
user, region, compartment, VCN/subnet, API key fingerprint and key file). Never paste their values
into docs, commits or tickets.

## Backups (nightly pg_dump → R2)

- `deploy/backup.sh` runs via `litchai-backup.timer` (02:30 UTC daily). It
  `pg_dump`s the LitchAI database (custom format), pushes to the private R2
  bucket, and prunes by the grandfather-father-son policy
  (`litchai.ops.backup.select_for_deletion`: 7 daily / 4 weekly / 6 monthly).
- Install: copy the units to `/etc/systemd/system/`, then
  `systemctl enable --now litchai-backup.timer`.
- Requires (via Doppler + `/etc/litch/env`): `LITCHAI_DATABASE_URL`, `R2_BUCKET`, and
  the R2 S3 credentials; `backup.sh` builds the `rclone` remote `r2:` from them at runtime.

## Restore drill (do this quarterly)

1. Create a throwaway database: `sudo -u postgres createdb litchai_restore`
2. Create extensions: `sudo -u postgres psql -d litchai_restore -c 'CREATE EXTENSION vector; CREATE EXTENSION pg_trgm;'`
3. Pull the latest dump from R2: `rclone copy r2:$R2_BUCKET/litchai/<latest>.dump .`
4. Restore: `sudo -u postgres pg_restore --no-owner -d litchai_restore <latest>.dump`
5. Verify row counts against production for `documents`, `line_items`,
   `category_memory`; run `.venv/bin/pytest` pointed at the restored DB if desired.
6. Drop it: `sudo -u postgres dropdb litchai_restore`. Record the drill date + outcome here.

## Simulated VM restart (queue resilience)

Procrastinate stores queue state in Postgres, so a restart loses nothing:
`sudo reboot`, then confirm `litchai-worker` resumes and any in-flight
`categorization_events` were checkpointed. Long scans resume from the last
completed 6-page `extraction_chunk` (idempotent re-runs).

## Idle-reclaim heartbeat

`litchai-heartbeat.timer` fires `litchai.heartbeat` every 10 minutes (a bounded
CPU burst + a `SELECT 1`). Monitor 7-day 95th-percentile CPU/network/memory in
the OCI console; raise the burst (`heartbeat_burst(ms=…)`) if utilization dips
toward the reclamation floor.

## Stuck document ("Extracting…" forever)

A document only holds an *in-flight* status (`received`/`scanning`/`extracting`/
`categorizing`) while its `litchai.ingest_document` job is running. If it's stuck
there, the job died without recording a failure.

**Diagnose:**
- `journalctl -u litchai-worker -n 100 --no-pager` — look for a traceback ending
  the last `ingest_document` run.
- Queue state: `sudo -u postgres psql -d litchai -c
  "select id, task_name, status, attempts from procrastinate_jobs order by id desc limit 10"`.
  A `failed` job whose document is still `extracting` is the classic stuck case.
- Doc state: `… -c "select id, filename, status, progress->>'reason' from documents order by id"`.

**Self-heal:** `litchai.sweep_stale` (periodic task, every 10 min — `queue.py`,
`ops/sweep.py`) fails any in-flight document past a 30-min grace window that has
no live queue job, moving it to `extraction_failed`/`rejected` with a reason. So
a stuck doc resolves itself within ~10 min even after a `kill -9`/OOM/hang that
the job's own `try/except` can't catch. Confirm it's running:
`… -c "select max(id), max(scheduled_at) from procrastinate_jobs where task_name='litchai.sweep_stale'"`.

**User-facing retry:** once a doc is `extraction_failed` (retryable), the Analyses
review page / request AI card shows the reason + a **Reanalyze** button that
re-relays fresh ciphertext as a new backend document.

**Expected non-recoverable case:** a document that isn't a transactional source
(a blank annual-report/statement *template* with no date/description/amount rows)
correctly fails with `no recognizable header row` — that is the extractor working,
not a bug. Reanalyzing the same template fails the same way by design.

## NDPA — retention & erasure

**Processors (data-protection register):** Cloudflare (Tunnel + R2) and Vercel.
Vercel is a **blind relay** only (PRD §12.6) — it forwards the ciphertext
envelope and never holds a usable plaintext or decrypt key.

**Personal data at rest:** client documents (ciphertext), `line_items`
(narration text), and — importantly — `category_memory` (`normalized_text` is
personal data), plus `categorization_events` and `ai_calls`.

**Retention:** client documents + `line_items` are kept for the engagement's
statutory retention window, then erased. `category_memory`,
`categorization_events` and `ai_calls` follow the same window; firm-global
memory rows (anonymized narration patterns, `client_id IS NULL`) are retained as
learning data unless a specific client erasure flags them (below).

**Right-to-erasure** — `POST /clients/{client_id}/erase` (or
`litchai.ops.erasure.erase_client`):
- deletes the client's documents (cascading `line_items` / `extraction_chunks` /
  `categorization_events` / `corrections`), engagements, and generated files;
- deletes **client-scoped** `category_memory`;
- flags firm-global `category_memory` rows carrying that client's narration text
  `stale = true` for operator review/purge (a client's data may have promoted
  into global memory).
The endpoint returns per-entity counts for the erasure record.

## Local model (llama-server) and the bench

The workbench and Sage try Groq → Cloudflare Workers AI → SambaNova → OpenRouter (only when
`OPENROUTER_API_KEY` is set) → local (`LITCHAI_PROVIDER_CHAIN` overrides; Cerebras is out of the
default order). Workers AI needs `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN` in Doppler. "Local" is Ollama until `LITCHAI_LLAMA_SERVER_URL` is set,
then llama.cpp's `llama-server` (`litchai-llama.service`, 127.0.0.1:8081, a Q4_0 model repacked
for NEON, niced with a low CPU weight and no CPU quota, 6 GB memory cap). Clients on "local only"
always use it.

1. Install / rebuild / swap model (as root; idempotent):
   `MODEL_URL=<.gguf resolve URL> MODEL_SHA256=<from the model card> bash deploy/install-llama.sh`
   (pin `LLAMA_CPP_REF=<release tag>` once a build is benched; the built commit is in
   `llama.cpp/BUILT_COMMIT`). Model and flags live in `/etc/litch/llama.env`.
2. Bench against Ollama on a quiet box (both serve one request at a time):
   `sudo -u litch /usr/local/bin/litch-run /srv/projects/litchconsulting/venv/bin/python -m litchai.ops.llm_bench --target llama,openai,http://127.0.0.1:8081/v1,<alias>,litchai-llama --target ollama,ollama,http://127.0.0.1:11434,gemma3:4b,ollama --out /tmp/llm-bench.json`
   Reports time to first token, prompt and decode tokens/s, the real workbench prompt,
   the share of schema-valid agent steps, and each unit's memory.
3. Score answers, not just speed: `python -m litchai.evals.workbench --provider local --out /tmp/eval-local.json`
   (49 golden tasks; `--provider none` is the no-model floor, `--category tax` etc. for a subset).
4. Switch the API over only if it wins: add `LITCHAI_LLAMA_SERVER_URL=http://127.0.0.1:8081`
   and `LITCHAI_LOCAL_MODEL=<alias>` to `/etc/litch/env`, then
   `systemctl restart litchai-api litchai-worker`. Roll back by removing those two lines.
   Embeddings stay on Ollama (`nomic-embed-text`) either way.

## Observability

`GET /observability` (surfaced at `/admin/analyses/observability`): documents by
status, rejected count, needs-review total, per-rung hit rates, and the rung-4
fallback rate. Richer SQL views (most-corrected categories, still-confusing
narrations, LLM usage) are in `litchai.categorize.reports.SQL_VIEWS`.

## Audit trail (FR9)

Every document and engagement state transition is written to `audit_log` by the
state machines (`documents/state.py`, `documents/engagement_state.py`) — no bare
status updates exist in the code. `generated_files` records the compiler,
contract-schema, taxonomy, tax-config and recompute-engine versions per file.
