"""Data-access layer (Phase 2a). Import the psycopg seam explicitly
(``from litchai.db.pg import PostgresRepository``) so the package import itself
stays free of a database dependency."""
from litchai.db.memory import InMemoryRepository
from litchai.db.repo import (
    Document,
    Engagement,
    KnowledgeChunk,
    LineItem,
    Repository,
    RepositoryError,
)

__all__ = [
    "Document",
    "Engagement",
    "InMemoryRepository",
    "KnowledgeChunk",
    "LineItem",
    "Repository",
    "RepositoryError",
]
