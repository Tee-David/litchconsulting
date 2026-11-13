"""Sage for staff: assigned requests only, no money, no writes (CLAUDE.md)."""
from test_assistant_chat import CLIENT, _answer, _seeded

from litchai.ai import assistant as A


def test_staff_cannot_reach_firm_wide_reads():
    repo, emb, router = _seeded()
    repo.create_document(client_id=CLIENT, filename="gtbank.pdf", mime="application/pdf",
                         source_hash="h1")
    result = A.answer_chat("list the documents we have analysed", repo=repo, embedder=emb,
                           provider=_answer("one doc"), router=router, role="staff")
    assert result.tool == "list_analyses"
    assert result.tool_result is None and result.can_answer is False
    assert "Only an admin" in result.answer and result.scope_applied is True


def test_staff_get_no_write_proposals():
    repo, emb, router = _seeded()
    provider = _answer("nope")
    result = A.answer_chat("approve engagement 4", repo=repo, embedder=emb, provider=provider,
                           router=router, role="staff")
    assert result.proposal is None and result.scope_applied is True
    assert "Only an admin can do that" in result.answer
    assert len(provider.calls) == 0


def test_staff_can_ask_knowledge_questions():
    repo, emb, router = _seeded()
    result = A.answer_chat("what is the vat rate in nigeria", repo=repo, embedder=emb,
                           provider=_answer("7.5%"), router=router, role="staff")
    assert result.tool == "search_knowledge" and result.can_answer
    assert result.scope_applied is True


def test_admin_unchanged():
    repo, emb, router = _seeded()
    repo.create_document(client_id=CLIENT, filename="gtbank.pdf", mime="application/pdf",
                         source_hash="h1")
    result = A.answer_chat("list the documents we have analysed", repo=repo, embedder=emb,
                           provider=_answer("one doc"), router=router)
    assert result.tool_result["count"] == 1 and result.scope_applied is True


def test_staff_never_get_client_context():
    repo, emb, router = _seeded()
    result = A.answer_chat("what is the vat rate in nigeria", repo=repo, embedder=emb,
                           provider=_answer("7.5%"), router=router, role="staff",
                           scope="client", client_id=CLIENT)
    assert result.scope_applied is True and result.can_answer
