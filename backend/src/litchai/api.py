"""FastAPI skeleton (PRD §8) — the API-only backend that will sit behind the
Cloudflare Tunnel + Zero Trust Access. Binds to loopback on the VM; nothing
here is ever publicly exposed directly.

Run (VM): ``uvicorn litchai.api:app --host 127.0.0.1 --port 8000``
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from litchai.queue import queue

API_VERSION = "0.1.0"


@asynccontextmanager
async def _lifespan(app: FastAPI):
    async with queue.open_async():
        yield


def create_app() -> FastAPI:
    app = FastAPI(title="LitchAI", version=API_VERSION, lifespan=_lifespan)

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok", "service": "litchai", "version": API_VERSION}

    @app.get("/health/queue")
    async def health_queue() -> dict:
        jobs = await queue.job_manager.list_jobs_async()
        return {"status": "ok", "jobs": len(list(jobs))}

    return app


app = create_app()
