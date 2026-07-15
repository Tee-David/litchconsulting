"""Pre-parse format + zip-bomb guards (Phase 2b, FR1).

Client workbooks are zip archives; a malicious one can decompress to gigabytes
or carry thousands of members. These checks run **before openpyxl touches the
bytes** (and, on the VM, inside the Docker/ClamAV sandbox). Nothing here parses
spreadsheet content — it only inspects the zip directory and magic bytes.
"""
from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass


class SandboxRejected(ValueError):
    pass


@dataclass(frozen=True)
class ZipLimits:
    max_members: int = 2000
    max_total_uncompressed: int = 512 * 1024 * 1024  # 512 MB
    max_ratio: int = 200                              # per-member compression ratio


XLSX_MAGIC = b"PK\x03\x04"


def is_zip(data: bytes) -> bool:
    return data[:4] == XLSX_MAGIC


def check_zip_safety(data: bytes, limits: ZipLimits | None = None) -> None:
    """Raise :class:`SandboxRejected` on a zip bomb / over-large / malformed
    archive. Inspects the central directory only — no extraction."""
    limits = limits or ZipLimits()
    if not is_zip(data):
        raise SandboxRejected("not a zip/xlsx container")
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            infos = zf.infolist()
            if len(infos) > limits.max_members:
                raise SandboxRejected(f"too many members ({len(infos)} > {limits.max_members})")
            total = 0
            for info in infos:
                total += info.file_size
                if total > limits.max_total_uncompressed:
                    raise SandboxRejected("uncompressed size exceeds limit (zip bomb?)")
                if info.compress_size > 0:
                    ratio = info.file_size / info.compress_size
                    if ratio > limits.max_ratio:
                        raise SandboxRejected(
                            f"member {info.filename!r} compression ratio {ratio:.0f}x exceeds limit"
                        )
    except zipfile.BadZipFile as exc:
        raise SandboxRejected(f"malformed zip: {exc}") from exc


def sniff_mime(data: bytes, declared_mime: str) -> str:
    """Cheap magic-byte cross-check so a renamed ``.exe`` posted as a PDF is
    caught before parsing. Returns the sniffed mime; the caller compares."""
    if data[:5] == b"%PDF-":
        return "application/pdf"
    if is_zip(data):
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    # CSV/plain text: no reliable magic; trust the declared type.
    return declared_mime
