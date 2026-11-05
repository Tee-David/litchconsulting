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
        import clamd

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


# --- Scan a file the web app holds in private R2 (uploads never touch the VM) ----
SCAN_MAX_BYTES = 25 * 1024 * 1024  # clamd StreamMaxLength on the VM
_R2_HOST_SUFFIX = ".r2.cloudflarestorage.com"


def scan_url(url: str, scanner: Scanner | None = None, fetch=None) -> dict:
    """Download ``url`` (a short-lived presigned R2 GET) and scan it.

    Returns ``{"status": "clean"|"infected"|"too_large"|"error", ...}``. Only
    HTTPS links to R2 are fetched (no SSRF into the VM's network)."""
    from urllib.parse import urlparse

    u = urlparse(url or "")
    if u.scheme != "https" or not (u.hostname or "").endswith(_R2_HOST_SUFFIX):
        return {"status": "error", "detail": "only presigned R2 https links can be scanned"}
    try:
        data = (fetch or _fetch_capped)(url)
    except _TooLarge:
        return {"status": "too_large", "detail": f"over {SCAN_MAX_BYTES // (1024 * 1024)} MB"}
    except Exception as exc:  # noqa: BLE001 — report, never crash the API
        return {"status": "error", "detail": f"download failed: {type(exc).__name__}"}
    sc = scanner or build_scanner()
    try:
        res = sc.scan(data)
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "detail": f"scanner failed: {type(exc).__name__}"}
    if sc.name == "noop":
        return {"status": "error", "detail": "no virus scanner configured", "bytes": len(data)}
    return {"status": "clean" if res.clean else "infected", "signature": res.signature,
            "scanner": res.scanner, "bytes": len(data)}


class _TooLarge(Exception):
    pass


def _fetch_capped(url: str) -> bytes:
    import httpx

    buf = bytearray()
    with httpx.stream("GET", url, timeout=60, follow_redirects=False) as r:
        r.raise_for_status()
        for chunk in r.iter_bytes():
            buf.extend(chunk)
            if len(buf) > SCAN_MAX_BYTES:
                raise _TooLarge
    return bytes(buf)
