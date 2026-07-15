"""Procrastinate job queue (PRD §8) — Postgres-backed, no extra broker.

Queue state lives in the same Postgres as the pipeline data and survives
restarts. The connector string is read from LITCHAI_DATABASE_URL when the app
opens (API lifespan / worker startup), never at import; tests swap in
procrastinate's InMemoryConnector via ``queue.replace_connector``.

Worker (VM): ``procrastinate --app=litchai.queue.queue worker``
Schema:      ``procrastinate --app=litchai.queue.queue schema --apply``
"""
from __future__ import annotations

import os

from procrastinate import App, PsycopgConnector

queue = App(
    connector=PsycopgConnector(conninfo=os.environ.get("LITCHAI_DATABASE_URL", ""))
)


@queue.task(name="litchai.ping")
def ping(payload: str = "pong") -> str:
    """Smoke-test task: proves defer → store → worker → result end-to-end."""
    return payload
