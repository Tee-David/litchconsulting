-- LitchAI application schema (PRD §11). Idempotent: safe to re-run.
-- Procrastinate owns its own tables (applied via its CLI). client_id holds
-- litchconsulting's client.id (a uuid in a separate CockroachDB) — stored, not
-- foreign-keyed, because it lives in another database.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

-- Chart of categories mirrored from litch-taxonomy.json by the seed CLI, so
-- line_items / category_memory get referential integrity and joins.
CREATE TABLE IF NOT EXISTS taxonomy_categories (
    code             text PRIMARY KEY,
    taxonomy_version text NOT NULL,
    label            text NOT NULL,
    parent           text,
    postable         boolean NOT NULL,
    nature           text,
    source           text NOT NULL DEFAULT 'transactions'
);

-- One annual report / statement compiles from many documents for a client-period.
CREATE TABLE IF NOT EXISTS engagements (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id    uuid NOT NULL,
    period_label text NOT NULL,
    template     text NOT NULL,           -- 'annual_report_ias1' | 'pnl' | ...
    aux_inputs   jsonb,
    materiality  numeric(18,2),
    status       text NOT NULL DEFAULT 'open',
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    engagement_id     bigint REFERENCES engagements(id),
    client_id         uuid NOT NULL,
    filename          text NOT NULL,
    mime              text NOT NULL,
    source_hash       text NOT NULL,        -- sha256 of ciphertext (matches Vercel log line)
    byte_size         bigint,
    status            text NOT NULL DEFAULT 'received',
    progress          jsonb NOT NULL DEFAULT '{}'::jsonb,
    extraction_engine text,
    account_label     text,                 -- for statement-overlap detection
    period_start      date,
    period_end        date,
    created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_engagement_idx ON documents (engagement_id);
CREATE INDEX IF NOT EXISTS documents_client_hash_idx ON documents (client_id, source_hash);

CREATE TABLE IF NOT EXISTS extraction_chunks (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id bigint NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_start  int NOT NULL,
    page_end    int NOT NULL,
    engine      text NOT NULL,
    status      text NOT NULL DEFAULT 'pending',
    attempt     int NOT NULL DEFAULT 0,
    raw         jsonb,
    duration_ms int,
    UNIQUE (document_id, page_start)
);

CREATE TABLE IF NOT EXISTS line_items (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id       bigint NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_id          bigint REFERENCES extraction_chunks(id) ON DELETE SET NULL,
    page_ref          int,
    sheet_ref         text,
    row_ref           int,
    txn_date          date,
    raw_text          text NOT NULL,
    normalized_text   text NOT NULL,
    direction         text CHECK (direction IN ('in','out')),
    normalized_amount numeric(18,2) NOT NULL,
    flags             jsonb NOT NULL DEFAULT '[]'::jsonb,
    category_code     text REFERENCES taxonomy_categories(code),
    taxonomy_version  text,
    category_source   text CHECK (category_source IN ('exact','trigram','vector','llm','human')),
    confidence        real,
    needs_review      boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS line_items_document_idx ON line_items (document_id);
CREATE INDEX IF NOT EXISTS line_items_normalized_idx ON line_items (normalized_text);

-- The retrieval store the ladder queries (seeds + corrections + approved runs).
CREATE TABLE IF NOT EXISTS category_memory (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    normalized_text  text NOT NULL,
    embedding        vector(768),
    embedding_model  text,
    normalizer_version text NOT NULL DEFAULT 'v1',
    category_code    text NOT NULL REFERENCES taxonomy_categories(code),
    taxonomy_version text NOT NULL,
    source           text NOT NULL CHECK (source IN ('seed_template','seed_history','human_correction','approved_run')),
    client_id        uuid,                  -- NULL = firm-global
    weight           real NOT NULL DEFAULT 1.0,
    stale            boolean NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (normalized_text, category_code, source, client_id)
);
CREATE INDEX IF NOT EXISTS category_memory_trgm_idx ON category_memory USING gin (normalized_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS category_memory_vec_idx ON category_memory USING hnsw (embedding vector_cosine_ops);

-- Per-rung decision log (replayable; feeds threshold tuning + learning reports).
CREATE TABLE IF NOT EXISTS categorization_events (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    line_item_id     bigint REFERENCES line_items(id) ON DELETE CASCADE,
    normalized_text  text NOT NULL,
    rung             smallint NOT NULL CHECK (rung BETWEEN 1 AND 4),
    candidates       jsonb NOT NULL,
    threshold        real,
    accepted         boolean NOT NULL,
    chosen_code      text,
    duration_ms      int,
    model            text,
    taxonomy_version text NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS categorization_events_line_idx ON categorization_events (line_item_id);

-- HITL correction audit trail (the retrieval copy is dual-written to category_memory).
CREATE TABLE IF NOT EXISTS corrections (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    line_item_id    bigint REFERENCES line_items(id) ON DELETE SET NULL,
    field_changed   text NOT NULL,
    old_value       text,
    new_value       text,
    normalized_text text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- AI-harness telemetry (OTel GenAI vocabulary) — one row per attempt incl. cache hits.
CREATE TABLE IF NOT EXISTS ai_calls (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at       timestamptz NOT NULL DEFAULT now(),
    trace_id         uuid,
    task             text NOT NULL,
    provider         text NOT NULL,
    request_model    text NOT NULL,
    model_digest     text,
    prompt_version   text,
    prompt_hash      text,
    taxonomy_version text,
    schema_hash      text,
    input_ref        text,
    input_hash       text NOT NULL,
    params           jsonb NOT NULL DEFAULT '{}'::jsonb,
    output           jsonb,
    raw_output       text,
    finish_reason    text,
    input_tokens     int,
    output_tokens    int,
    latency_ms       int,
    attempt          smallint NOT NULL DEFAULT 1,
    cache_hit        boolean NOT NULL DEFAULT false,
    status           text NOT NULL,
    error            text
);
CREATE INDEX IF NOT EXISTS ai_calls_task_time_idx ON ai_calls (task, created_at DESC);

-- Exact-match LLM cache; version components in the key make bumps auto-invalidate.
CREATE TABLE IF NOT EXISTS ai_cache (
    cache_key        text PRIMARY KEY,
    task             text NOT NULL,
    request_model    text NOT NULL,
    model_digest     text,
    prompt_version   text,
    taxonomy_version text,
    schema_hash      text,
    input_hash       text NOT NULL,
    output           jsonb NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    last_hit_at      timestamptz,
    hit_count        int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS generated_files (
    id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    engagement_id           bigint REFERENCES engagements(id),
    template                text NOT NULL,
    compiler_version        text NOT NULL,
    contract_schema_version text,
    taxonomy_version        text,
    tax_config_version      text,
    recompute_engine        text,
    validation_status       text NOT NULL,
    hitl_status             text NOT NULL DEFAULT 'draft',
    sha256                  text,
    created_at              timestamptz NOT NULL DEFAULT now()
);

-- Append-only: every state transition (FR9).
CREATE TABLE IF NOT EXISTS audit_log (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity      text NOT NULL,            -- 'document' | 'engagement' | 'generated_file'
    entity_id   bigint NOT NULL,
    from_state  text,
    to_state    text NOT NULL,
    detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log (entity, entity_id);
