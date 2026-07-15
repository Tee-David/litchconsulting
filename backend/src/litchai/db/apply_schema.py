"""Apply ``db/schema.sql`` to the VM's Postgres (idempotent).

    python -m litchai.db.apply_schema

Reads ``LITCHAI_DATABASE_URL``. Procrastinate's own tables are applied
separately via ``procrastinate --app=litchai.queue.queue schema --apply``.
"""
from __future__ import annotations

from litchai.db.pg import apply_schema, connect


def main() -> None:
    conn = connect()
    try:
        apply_schema(conn)
        print("litchai schema applied")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
