"""Malware-scan seam (FR1, Phase 2b sandbox).

Real ClamAV (``clamd`` INSTREAM) runs inside the Docker sandbox on the VM;
:class:`NoopScanner` (always clean) backs local tests and the format-only path.
Nothing is parsed before a clean scan.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class ScanResult:
    clean: bool
    signature: str | None = None
    scanner: str = "noop"


class Scanner(Protocol):
    name: str

    def scan(self, data: bytes) -> ScanResult: ...


class NoopScanner:
    """Passes everything. Used locally and when ClamAV isn't configured; the VM
    sets ``LITCHAI_CLAMAV_HOST`` to swap in the real scanner."""

    name = "noop"

    def scan(self, data: bytes) -> ScanResult:
        return ScanResult(clean=True, scanner=self.name)


class ClamAVScanner:
    """clamd INSTREAM scan (VM). ``clamd`` is imported lazily so the dependency
    is VM-only and this module stays importable everywhere."""

    name = "clamav"

    def __init__(self, host: str = "127.0.0.1", port: int = 3310) -> None:
        import clamd  # noqa: PLC0415 — VM-only optional dependency

        self._cd = clamd.ClamdNetworkSocket(host=host, port=port)

    def scan(self, data: bytes) -> ScanResult:
        import io

        status, signature = self._cd.instream(io.BytesIO(data))["stream"]
        return ScanResult(clean=(status == "OK"), signature=signature, scanner=self.name)


def build_scanner() -> Scanner:
    """VM wiring: ClamAV if configured, else the no-op scanner."""
    host = os.environ.get("LITCHAI_CLAMAV_HOST")
    if host:
        return ClamAVScanner(host=host, port=int(os.environ.get("LITCHAI_CLAMAV_PORT", "3310")))
    return NoopScanner()
