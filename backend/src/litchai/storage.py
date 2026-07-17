"""Ciphertext storage on the VM (Phase 2a).

Blind-relay envelopes (PRD §12.6) land here as opaque bytes — the worker decrypts
in memory just before scan/extract and never writes plaintext back. The disk is
also OCI-encrypted at rest, so this dir holds doubly-protected ciphertext only.
The filename is the source hash, matching the ``documents.source_hash`` column
and the Vercel relay log line.
"""
from __future__ import annotations

import os
from pathlib import Path

DEFAULT_ROOT = "/var/lib/litchai/uploads"


class Storage:
    def __init__(self, root: str | Path | None = None) -> None:
        self.root = Path(root or os.environ.get("LITCHAI_STORAGE_DIR", DEFAULT_ROOT))

    def path_for(self, client_id: str, source_hash: str) -> Path:
        return self.root / client_id / f"{source_hash}.enc"

    def store(self, client_id: str, source_hash: str, data: bytes) -> Path:
        path = self.path_for(client_id, source_hash)
        path.parent.mkdir(parents=True, exist_ok=True)
        # 0o600 so only the service user can read the ciphertext.
        with open(path, "wb", opener=lambda p, flags: os.open(p, flags, 0o600)) as fh:
            fh.write(data)
        return path

    def read(self, client_id: str, source_hash: str) -> bytes:
        return self.path_for(client_id, source_hash).read_bytes()

    def exists(self, client_id: str, source_hash: str) -> bool:
        return self.path_for(client_id, source_hash).exists()

    # --- compiled deliverables -------------------------------------------
    #
    # Compiled workbooks are OUR output, not client ciphertext, so they live in
    # a sibling tree. They are content-addressed by the same sha256 already
    # recorded on ``generated_files``, which is what lets a caller go
    # generated_file → bytes without another column.

    def artifact_path_for(self, sha256: str) -> Path:
        return self.root / "artifacts" / f"{sha256}.xlsx"

    def store_artifact(self, sha256: str, data: bytes) -> Path:
        path = self.artifact_path_for(sha256)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb", opener=lambda p, flags: os.open(p, flags, 0o600)) as fh:
            fh.write(data)
        return path

    def read_artifact(self, sha256: str) -> bytes:
        return self.artifact_path_for(sha256).read_bytes()

    def artifact_exists(self, sha256: str) -> bool:
        return self.artifact_path_for(sha256).exists()
