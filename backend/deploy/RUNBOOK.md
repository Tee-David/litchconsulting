# LitchAI Operations Runbook (Phase 6)

Hardening procedures for the OCI VM. Companion to `plans/checklist.md` Phase 6.

## Backups (nightly pg_dump → R2)

- `deploy/backup.sh` runs via `litchai-backup.timer` (02:30 UTC daily). It
  `pg_dump`s the LitchAI database (custom format), pushes to the private R2
  bucket, and prunes by the grandfather-father-son policy
  (`litchai.ops.backup.select_for_deletion`: 7 daily / 4 weekly / 6 monthly).
- Install: copy the units to `/etc/systemd/system/`, then
  `systemctl enable --now litchai-backup.timer`.
- Requires in `/etc/litchai/env`: `LITCHAI_DATABASE_URL`, `R2_BUCKET`, and an
  `rclone` remote named `r2:` (Cloudflare R2 S3 credentials).

## Restore drill (do this quarterly)

1. Spin up a throwaway Postgres container:
   `docker run -d --name litchai-restore -e POSTGRES_PASSWORD=x -p 5433:5432 pgvector/pgvector:pg16`
2. Create extensions: `psql … -c 'CREATE EXTENSION vector; CREATE EXTENSION pg_trgm;'`
3. Pull the latest dump from R2: `rclone copy r2:$R2_BUCKET/litchai/<latest>.dump .`
4. Restore: `pg_restore --no-owner --dbname postgresql://…:5433/postgres <latest>.dump`
5. Verify row counts against production for `documents`, `line_items`,
   `category_memory`; run `.venv/bin/pytest` pointed at the restored DB if desired.
6. Tear down the container. Record the drill date + outcome here.

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
- Queue state: `sudo docker exec litchai-postgres psql -U litchai -d litchai -c
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

## Observability

`GET /observability` (surfaced at `/admin/litchai/observability`): documents by
status, rejected count, needs-review total, per-rung hit rates, and the rung-4
fallback rate. Richer SQL views (most-corrected categories, still-confusing
narrations, LLM usage) are in `litchai.categorize.reports.SQL_VIEWS`.

## Audit trail (FR9)

Every document and engagement state transition is written to `audit_log` by the
state machines (`documents/state.py`, `documents/engagement_state.py`) — no bare
status updates exist in the code. `generated_files` records the compiler,
contract-schema, taxonomy, tax-config and recompute-engine versions per file.
