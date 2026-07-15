"""Phase 1 scaffold: FastAPI skeleton + Procrastinate queue wiring.

These run against procrastinate's InMemoryConnector (no Postgres needed
locally); the real-Postgres round-trip — schema apply, defer, worker
processes the job — is verified on the VM and recorded in the checklist.
"""
from fastapi.testclient import TestClient
from procrastinate import testing

from litchai.api import create_app
from litchai.queue import ping, queue


def test_ping_task_defers_with_payload():
    in_memory = testing.InMemoryConnector()
    with queue.replace_connector(in_memory):
        ping.defer(payload="hello")
        assert len(in_memory.jobs) == 1
        job = next(iter(in_memory.jobs.values()))
        assert job["task_name"] == "litchai.ping"
        assert job["args"] == {"payload": "hello"}


def test_health_endpoints():
    in_memory = testing.InMemoryConnector()
    with queue.replace_connector(in_memory):
        with TestClient(create_app()) as client:
            body = client.get("/health").json()
            assert body["status"] == "ok"
            assert body["service"] == "litchai"

            ping.defer(payload="one")
            queue_body = client.get("/health/queue").json()
            assert queue_body["status"] == "ok"
            assert queue_body["jobs"] == 1
