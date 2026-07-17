"""Copilot RAG ingestion (Milestone 8).

Chunks the firm-global corpus — services catalogue copy, FAQs/help articles, the
NTA-2025 tax configuration and internal SOPs — into ~300-500-token windows
(markdown-header split, then a recursive paragraph/sentence split with ~50-token
overlap), embeds each window with :mod:`litchai.embeddings`, and upserts it into
``knowledge_chunk`` keyed on ``content_hash`` (so reindex is idempotent).

Per-client operational context (request / invoice / ticket summaries) is
ingested with ``scope='client'`` and a ``client_id`` and is only ever retrieved
under a hard client filter (see :mod:`litchai.categorize.retrieval`).

CLI (VM — needs Postgres + Ollama)::

    python -m litchai.knowledge reindex [--corpus-dir DIR]

The pure functions (chunking, corpus building, embedding, :func:`reindex`) take a
:class:`~litchai.db.repo.Repository` and an :class:`~litchai.embeddings.Embedder`,
so the whole thing is testable with the in-memory repo + :class:`FakeEmbedder`.
"""
from __future__ import annotations

import argparse
import hashlib
import re
from dataclasses import dataclass, replace
from pathlib import Path

from litchai.db.repo import KnowledgeChunk, Repository
from litchai.embeddings import Embedder

CORPUS_DIR = Path(__file__).parent / "corpus"

# Filename stem → source_type for the seed markdown corpus.
_SOURCE_TYPES = {"services": "services", "faqs": "faq", "sops": "sop"}

TARGET_TOKENS = 450
MIN_TOKENS = 40
OVERLAP_TOKENS = 50


def estimate_tokens(text: str) -> int:
    """Cheap word-based token estimate (~1.3 tokens/word) — good enough to size
    chunks without pulling in a tokenizer."""
    return max(1, round(len(text.split()) * 1.3))


def _content_hash(source_type: str, source_id: str, section: str | None, ordinal: int, text: str) -> str:
    payload = f"{source_type}\x1f{source_id}\x1f{section or ''}\x1f{ordinal}\x1f{text}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _doc_title(md: str, fallback: str) -> str:
    m = re.search(r"^#\s+(.*)$", md, re.MULTILINE)
    return m.group(1).strip() if m else fallback


def split_markdown_sections(md: str) -> list[tuple[str | None, str]]:
    """Split on markdown headers, returning ``(deepest_header, body)`` pairs.
    Body before the first header (or under the H1) carries the last header seen."""
    sections: list[tuple[str | None, str]] = []
    current: str | None = None
    buf: list[str] = []
    for line in md.splitlines():
        m = re.match(r"^#{1,6}\s+(.*)$", line)
        if m:
            body = "\n".join(buf).strip()
            if body:
                sections.append((current, body))
            buf = []
            current = m.group(1).strip()
        else:
            buf.append(line)
    body = "\n".join(buf).strip()
    if body:
        sections.append((current, body))
    return sections


def _split_sentences(text: str, target_tokens: int) -> list[str]:
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    out: list[str] = []
    cur: list[str] = []
    cur_tok = 0
    for s in sentences:
        st = estimate_tokens(s)
        if cur and cur_tok + st > target_tokens:
            out.append(" ".join(cur))
            cur, cur_tok = [], 0
        cur.append(s)
        cur_tok += st
    if cur:
        out.append(" ".join(cur))
    return out


def _overlap_tail(paras: list[str], overlap_tokens: int) -> list[str]:
    tail: list[str] = []
    total = 0
    for p in reversed(paras):
        if total >= overlap_tokens:
            break
        tail.insert(0, p)
        total += estimate_tokens(p)
    return tail


def split_text(
    text: str, *, target_tokens: int = TARGET_TOKENS, overlap_tokens: int = OVERLAP_TOKENS
) -> list[str]:
    """Recursive paragraph split into ~``target_tokens`` windows with
    ``overlap_tokens`` of trailing overlap; oversize paragraphs fall back to a
    sentence split."""
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    cur: list[str] = []
    cur_tok = 0
    for p in paras:
        pt = estimate_tokens(p)
        if pt > target_tokens:
            if cur:
                chunks.append("\n\n".join(cur))
                cur, cur_tok = [], 0
            chunks.extend(_split_sentences(p, target_tokens))
            continue
        if cur and cur_tok + pt > target_tokens:
            chunks.append("\n\n".join(cur))
            cur = _overlap_tail(cur, overlap_tokens)
            cur_tok = sum(estimate_tokens(x) for x in cur)
        cur.append(p)
        cur_tok += pt
    if cur:
        chunks.append("\n\n".join(cur))
    return chunks


def chunk_document(
    md: str,
    *,
    source_type: str,
    source_id: str,
    doc_title: str | None = None,
    scope: str = "firm",
    client_id: str | None = None,
    target_tokens: int = TARGET_TOKENS,
    overlap_tokens: int = OVERLAP_TOKENS,
) -> list[KnowledgeChunk]:
    """Chunk one markdown document into embeddable :class:`KnowledgeChunk`\\ s
    (``embedding`` left ``None`` — :func:`embed_chunks` fills it)."""
    title = doc_title or _doc_title(md, source_id)
    out: list[KnowledgeChunk] = []
    ordinal = 0
    for section, body in split_markdown_sections(md):
        label = None if section == title else section
        for window in split_text(body, target_tokens=target_tokens, overlap_tokens=overlap_tokens):
            if estimate_tokens(window) < MIN_TOKENS and out and out[-1].section == label:
                # Fold a tiny trailing fragment back into the previous chunk.
                merged = out[-1].text + "\n\n" + window
                out[-1] = replace(
                    out[-1], text=merged, tokens=estimate_tokens(merged),
                    content_hash=_content_hash(source_type, source_id, label, ordinal - 1, merged),
                )
                continue
            out.append(
                KnowledgeChunk(
                    source_type=source_type,
                    source_id=source_id,
                    title=title,
                    section=label,
                    text=window,
                    content_hash=_content_hash(source_type, source_id, label, ordinal, window),
                    tokens=estimate_tokens(window),
                    scope=scope,
                    client_id=client_id,
                )
            )
            ordinal += 1
    return out


def _render_tax_config(cfg: dict) -> tuple[str, str]:
    """Render the versioned Nigeria tax config JSON into a markdown document so it
    joins the RAG store as prose. Returns ``(source_id, markdown)``."""
    lines = [f"# Nigeria Tax Configuration ({cfg.get('law', 'NTA 2025')})", ""]
    lines.append(
        f"Version {cfg.get('version')}, effective {cfg.get('effectiveFrom')}, "
        f"currency {cfg.get('currency')}. This is the firm's single source of truth for "
        "Nigerian tax rates and thresholds."
    )

    paye = cfg.get("paye", {})
    lines += ["", "## PAYE (Pay As You Earn) income tax bands", ""]
    for b in paye.get("bands", []):
        lines.append(f"- {b['label']}: taxed at {b['ratePct']}%.")
    rr = paye.get("rentRelief", {})
    if rr:
        lines.append(
            f"- Rent relief: {rr.get('ratePct')}% of annual rent, capped at "
            f"NGN {rr.get('cap'):,}."
        )
    if paye.get("minimumWageMonthly"):
        lines.append(f"- National minimum wage: NGN {paye['minimumWageMonthly']:,} per month.")

    vat = cfg.get("vat", {})
    lines += ["", "## VAT (Value Added Tax)", "",
              f"The standard VAT rate is {vat.get('standardRatePct')}%."]

    cit = cfg.get("cit", {})
    lines += ["", "## CIT (Companies Income Tax) and Development Levy", ""]
    lines.append(f"- Standard CIT rate: {cit.get('standardRatePct')}%.")
    small = cit.get("smallCompany", {})
    if small:
        lines.append(
            f"- Small companies pay {small.get('ratePct')}% CIT when turnover does not exceed "
            f"NGN {small.get('maxTurnover'):,} and fixed assets do not exceed "
            f"NGN {small.get('maxFixedAssets'):,}. Professional-services firms are excluded."
        )
    dev = cit.get("developmentLevy", {})
    if dev:
        lines.append(
            f"- Development Levy: {dev.get('ratePct')}% of {dev.get('base')}, replacing "
            f"{', '.join(dev.get('replaces', []))}."
        )

    wht = cfg.get("wht", {})
    lines += ["", "## WHT (Withholding Tax) rates", ""]
    exemption = wht.get("smallSupplierExemption", {})
    if exemption:
        lines.append(
            f"- Small-supplier exemption: payments up to NGN "
            f"{exemption.get('maxMonthlyPayment'):,} per month are exempt from WHT."
        )
    for _key, r in wht.get("rates", {}).items():
        lines.append(
            f"- {r['label']}: {r['corporatePct']}% for companies, {r['individualPct']}% for individuals."
        )

    payroll = cfg.get("payroll", {})
    pension = payroll.get("pension", {})
    lines += ["", "## Payroll contributions", ""]
    if pension:
        lines.append(
            f"- Pension: employee {pension.get('employeePct')}%, employer "
            f"{pension.get('employerPct')}% (or {pension.get('employerOnlyPct')}% employer-only)."
        )
    if payroll.get("nhf"):
        lines.append(f"- NHF (National Housing Fund): employee {payroll['nhf'].get('employeePct')}%.")
    if payroll.get("nsitf"):
        lines.append(f"- NSITF: employer {payroll['nsitf'].get('employerPct')}%.")

    return "nigeria-tax-config", "\n".join(lines)


def build_firm_chunks(corpus_dir: Path | None = None) -> list[KnowledgeChunk]:
    """Firm-global corpus: seed markdown files + the rendered tax config."""
    corpus_dir = corpus_dir or CORPUS_DIR
    chunks: list[KnowledgeChunk] = []
    for path in sorted(corpus_dir.glob("*.md")):
        stem = path.stem
        source_type = _SOURCE_TYPES.get(stem, stem)
        chunks += chunk_document(
            path.read_text(encoding="utf-8"), source_type=source_type, source_id=stem
        )

    try:
        from litchai.taxconfig import load_tax_config

        source_id, md = _render_tax_config(load_tax_config())
        chunks += chunk_document(md, source_type="tax_config", source_id=source_id)
    except FileNotFoundError:  # tax config not on the path (e.g. isolated CI) — skip
        pass

    return chunks


def embed_chunks(chunks: list[KnowledgeChunk], embedder: Embedder) -> list[KnowledgeChunk]:
    if not chunks:
        return []
    vectors = embedder.embed_documents([c.text for c in chunks])
    return [replace(c, embedding=vec) for c, vec in zip(chunks, vectors)]


@dataclass(frozen=True)
class ReindexResult:
    upserted: int
    deleted: int
    by_source: dict[str, int]


def reindex(
    repo: Repository,
    embedder: Embedder,
    *,
    corpus_dir: Path | None = None,
    replace_existing: bool = True,
) -> ReindexResult:
    """Rebuild the firm-global slice of ``knowledge_chunk``. Client-scoped rows
    are never touched here (they have their own ingestion path)."""
    chunks = build_firm_chunks(corpus_dir)
    chunks = embed_chunks(chunks, embedder)

    deleted = repo.delete_knowledge(scope="firm") if replace_existing else 0
    by_source: dict[str, int] = {}
    for c in chunks:
        repo.upsert_knowledge_chunk(c)
        by_source[c.source_type] = by_source.get(c.source_type, 0) + 1
    return ReindexResult(upserted=len(chunks), deleted=deleted, by_source=by_source)


def ingest_client_context(
    repo: Repository,
    embedder: Embedder,
    *,
    client_id: str,
    documents: list[tuple[str, str, str]],
    replace_existing: bool = True,
) -> ReindexResult:
    """Ingest per-client operational context. ``documents`` is a list of
    ``(source_type, source_id, text)`` (e.g. request / invoice / ticket
    summaries). Everything is stored ``scope='client'`` under a hard
    ``client_id`` so it can only ever be retrieved for that client."""
    chunks: list[KnowledgeChunk] = []
    for source_type, source_id, text in documents:
        chunks += chunk_document(
            text, source_type=source_type, source_id=source_id, doc_title=source_id,
            scope="client", client_id=client_id,
        )
    chunks = embed_chunks(chunks, embedder)
    deleted = (
        repo.delete_knowledge(scope="client", client_id=client_id) if replace_existing else 0
    )
    by_source: dict[str, int] = {}
    for c in chunks:
        repo.upsert_knowledge_chunk(c)
        by_source[c.source_type] = by_source.get(c.source_type, 0) + 1
    return ReindexResult(upserted=len(chunks), deleted=deleted, by_source=by_source)


def main(argv: list[str] | None = None) -> int:  # pragma: no cover - VM CLI wiring
    parser = argparse.ArgumentParser(prog="litchai.knowledge", description="Copilot RAG ingestion")
    sub = parser.add_subparsers(dest="cmd", required=True)
    rp = sub.add_parser("reindex", help="rebuild the firm-global knowledge store")
    rp.add_argument("--corpus-dir", type=Path, default=None, help="override the seed corpus dir")
    args = parser.parse_args(argv)

    if args.cmd == "reindex":
        from litchai.db.pg import PostgresRepository, connect
        from litchai.embeddings import OllamaEmbedder

        conn = connect()
        try:
            result = reindex(PostgresRepository(conn), OllamaEmbedder(), corpus_dir=args.corpus_dir)
        finally:
            conn.close()
        print(f"reindexed knowledge store: {result.upserted} chunks upserted, {result.deleted} removed")
        for source, n in sorted(result.by_source.items()):
            print(f"  {source}: {n}")
        return 0

    return 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
