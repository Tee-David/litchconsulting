"""Document state-machine tests (Phase 2a)."""
import pytest

from litchai.documents import (
    ALLOWED_TRANSITIONS,
    TERMINAL,
    DocumentStatus,
    IllegalTransition,
    can_transition,
    engagement_lock_key,
    transition,
)


def test_happy_path_is_reachable():
    path = [
        DocumentStatus.RECEIVED,
        DocumentStatus.SCANNING,
        DocumentStatus.EXTRACTING,
        DocumentStatus.EXTRACTED,
        DocumentStatus.CATEGORIZING,
        DocumentStatus.CATEGORIZED,
    ]
    for src, dst in zip(path, path[1:]):
        assert can_transition(src, dst)


def test_transition_returns_audit_entry():
    entry = transition(7, DocumentStatus.RECEIVED, DocumentStatus.SCANNING, {"scanner": "clamav"})
    assert entry.entity == "document"
    assert entry.entity_id == 7
    assert entry.from_state == "received"
    assert entry.to_state == "scanning"
    assert entry.detail == {"scanner": "clamav"}


def test_illegal_transition_raises():
    with pytest.raises(IllegalTransition):
        transition(1, DocumentStatus.RECEIVED, DocumentStatus.CATEGORIZED)


def test_terminal_states_have_no_exits():
    assert TERMINAL == {DocumentStatus.REJECTED, DocumentStatus.SUPERSEDED}
    for terminal in TERMINAL:
        assert not ALLOWED_TRANSITIONS[terminal]
        with pytest.raises(IllegalTransition):
            transition(1, terminal, DocumentStatus.EXTRACTING)


def test_extraction_failure_is_retryable():
    assert can_transition(DocumentStatus.EXTRACTING, DocumentStatus.EXTRACTION_FAILED)
    assert can_transition(DocumentStatus.EXTRACTION_FAILED, DocumentStatus.EXTRACTING)
    assert can_transition(DocumentStatus.EXTRACTION_FAILED, DocumentStatus.REJECTED)


def test_string_inputs_are_accepted():
    assert can_transition("received", "scanning")
    entry = transition(2, "extracted", "categorizing")
    assert entry.to_state == "categorizing"


def test_every_target_is_a_known_status():
    known = set(DocumentStatus)
    for src, targets in ALLOWED_TRANSITIONS.items():
        assert src in known
        assert targets <= known


def test_engagement_lock_key_is_stable_and_positive():
    a = engagement_lock_key(42)
    b = engagement_lock_key(42)
    assert a == b
    assert 0 <= a < (1 << 63)
    assert engagement_lock_key(42) != engagement_lock_key(43)
