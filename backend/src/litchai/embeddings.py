"""Embedding provider (Phase 3 rung 3).

``nomic-embed-text`` via Ollama on the VM (768-dim, ~11.8 embeds/s CPU — Phase 0).
nomic is an *asymmetric* model: the ``search_document:`` / ``search_query:``
prefixes are mandatory and applied HERE, on top of the canonical normalized text
(:mod:`litchai.categorize.normalize`) — never baked into the normalizer, which
also feeds exact/trigram. A deterministic :class:`FakeEmbedder` (hashing-trick
bag-of-words, so shared tokens raise cosine) backs the local test suite.
"""
from __future__ import annotations

import hashlib
import math
import os
from typing import Protocol, runtime_checkable

EMBED_DIM = 768
DOCUMENT_PREFIX = "search_document:"
QUERY_PREFIX = "search_query:"


@runtime_checkable
class Embedder(Protocol):
    model: str
    dim: int

    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    def embed_query(self, text: str) -> list[float]: ...


class OllamaEmbedder:
    """VM: one httpx POST per text to Ollama's embeddings endpoint."""

    dim = EMBED_DIM

    def __init__(self, host: str | None = None, model: str = "nomic-embed-text") -> None:
        self.model = model
        self._host = host or os.environ.get("LITCHAI_OLLAMA_HOST", "http://127.0.0.1:11434")

    def _embed(self, prefixed: str) -> list[float]:
        import httpx  # noqa: PLC0415

        resp = httpx.post(
            f"{self._host}/api/embeddings",
            json={"model": self.model, "prompt": prefixed},
            timeout=60.0,
        )
        resp.raise_for_status()
        return resp.json()["embedding"]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(f"{DOCUMENT_PREFIX} {t}") for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed(f"{QUERY_PREFIX} {text}")


class FakeEmbedder:
    """Deterministic hashing-trick bag-of-words vectors for tests. Not semantic,
    but stable and dimensioned, and texts sharing tokens get a real (>0) cosine —
    enough to exercise the store's nearest-neighbor logic and the ladder."""

    model = "fake-embed"

    def __init__(self, dim: int = 256) -> None:
        self.dim = dim

    def _vec(self, text: str) -> list[float]:
        vec = [0.0] * self.dim
        for token in text.split():
            h = int.from_bytes(hashlib.blake2b(token.encode(), digest_size=8).digest(), "big")
            vec[h % self.dim] += 1.0
        norm = math.sqrt(sum(v * v for v in vec))
        return [v / norm for v in vec] if norm else vec

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._vec(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._vec(text)


def cosine(a: list[float], b: list[float]) -> float:
    if len(a) != len(b):
        raise ValueError("dimension mismatch")
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0
