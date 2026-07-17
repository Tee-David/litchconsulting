"""Copilot RAG ingestion + retrieval tests (Milestone 8).

FakeEmbedder + InMemoryRepository — no Ollama/Postgres. Covers markdown-header +
recursive chunking, idempotent reindex, the scope/client_id hard filter, and RRF
hybrid retrieval with parent-section expansion.
"""
from litchai import knowledge as K
from litchai.categorize.retrieval import hybrid_knowledge
from litchai.db import InMemoryRepository, KnowledgeChunk
from litchai.embeddings import FakeEmbedder

CLIENT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
CLIENT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

MD = """# Guide Title

Intro paragraph under the H1 heading.

## First Section

First section body paragraph one. It has enough words to matter here.

## Second Section

Second section body about withholding tax and consultancy fees in Nigeria.
"""


def test_split_markdown_sections_tracks_headers():
    sections = K.split_markdown_sections(MD)
    labels = [s for s, _ in sections]
    assert "Guide Title" in labels          # intro under H1 carries the H1 title
    assert "First Section" in labels
    assert "Second Section" in labels


def test_chunk_document_sets_title_and_section():
    chunks = K.chunk_document(MD, source_type="faq", source_id="guide")
    assert chunks
    assert all(c.title == "Guide Title" for c in chunks)
    # the doc-intro chunk has section None (folded from the H1), others are labelled
    sections = {c.section for c in chunks}
    assert None in sections
    assert "Second Section" in sections
    assert all(c.content_hash for c in chunks)
    assert all(c.tokens > 0 for c in chunks)


def test_split_text_windows_respect_target_tokens():
    big = "\n\n".join(f"Paragraph number {i} with several words in it." for i in range(60))
    windows = K.split_text(big, target_tokens=60, overlap_tokens=10)
    assert len(windows) > 1
    assert all(K.estimate_tokens(w) <= 120 for w in windows)  # target + a little slack


def test_build_firm_corpus_covers_all_sources():
    chunks = K.build_firm_chunks()
    sources = {c.source_type for c in chunks}
    assert {"services", "faq", "sop", "tax_config"} <= sources
    assert all(c.scope == "firm" and c.client_id is None for c in chunks)


def test_reindex_is_idempotent():
    repo, emb = InMemoryRepository(), FakeEmbedder()
    first = K.reindex(repo, emb)
    total_after_first = len(repo.list_knowledge_chunks())
    second = K.reindex(repo, emb)
    assert first.upserted == second.upserted
    assert second.deleted == total_after_first           # cleared, then rebuilt
    assert len(repo.list_knowledge_chunks()) == total_after_first  # no duplicates


def test_hybrid_knowledge_returns_scored_citations():
    repo, emb = InMemoryRepository(), FakeEmbedder()
    K.reindex(repo, emb)
    hits = hybrid_knowledge("what is the vat rate in nigeria", repo, emb, min_score=0.0)
    assert hits
    assert all(h.similarity >= 0.0 and h.citation for h in hits)
    # a tax/vat chunk should surface among the results
    assert any("tax" in h.citation.lower() or "vat" in h.citation.lower() for h in hits)


def test_hybrid_knowledge_expands_parent_section():
    repo, emb = InMemoryRepository(), FakeEmbedder()
    K.reindex(repo, emb)
    hits = hybrid_knowledge("withholding tax rate", repo, emb, min_score=0.0, expand_sections=True)
    assert hits
    # section_text is at least as long as the single chunk text (siblings joined)
    assert all(len(h.section_text) >= len(h.chunk.text) for h in hits)


def test_client_scope_is_a_hard_filter():
    repo, emb = InMemoryRepository(), FakeEmbedder()
    K.reindex(repo, emb)  # firm-global
    K.ingest_client_context(
        repo, emb, client_id=CLIENT_A,
        documents=[("request", "req-1", "Client A wants a forensic audit of payroll fraud.")],
    )
    K.ingest_client_context(
        repo, emb, client_id=CLIENT_B,
        documents=[("request", "req-2", "Client B wants a forensic audit of payroll fraud.")],
    )
    # Client A retrieval never returns Client B's rows.
    a_hits = hybrid_knowledge("payroll fraud audit", repo, emb, client_id=CLIENT_A, min_score=0.0)
    a_client_ids = {h.chunk.client_id for h in a_hits}
    assert CLIENT_B not in a_client_ids
    # Firm-only retrieval (client_id=None) never returns any client-scoped rows.
    firm_hits = hybrid_knowledge("payroll fraud audit", repo, emb, client_id=None, min_score=0.0)
    assert all(h.chunk.scope == "firm" for h in firm_hits)


def test_repo_upsert_refreshes_on_content_hash():
    repo = InMemoryRepository()
    chunk = KnowledgeChunk(
        source_type="faq", source_id="x", title="T", text="hello world",
        content_hash="hash-1", tokens=2, embedding=[0.1] * 8,
    )
    a = repo.upsert_knowledge_chunk(chunk)
    b = repo.upsert_knowledge_chunk(chunk)
    assert a.id == b.id                                  # same hash → same row
    assert len(repo.list_knowledge_chunks()) == 1
