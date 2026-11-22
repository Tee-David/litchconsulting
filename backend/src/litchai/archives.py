"""Unpack ZIP, RAR (RAR4 and RAR5) and 7z archives, with or without a password.

Uses the 7-Zip program (``7z``, packages ``7zip`` and ``7zip-rar`` on the VM): one
small open-source tool that reads every common archive type, including AES ZIPs
and RAR5. The archive is listed first and checked against limits (number of files,
total size, size per file) before anything is written, then extracted flat (no
folders, so no path tricks) into a private temporary folder that is always removed.

The password goes to 7-Zip for that one call only. It is never stored or logged.
Every unpacked file is then stored and analysed like a normal upload (virus scan,
extraction, encryption at rest), so nothing here trusts the archive's contents.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

SEVEN_ZIP = shutil.which("7z") or shutil.which("7zz") or "7z"

MIME_BY_EXT = {
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
    "xls": "application/vnd.ms-excel",
    "ods": "application/vnd.oasis.opendocument.spreadsheet",
    "csv": "text/csv",
    "tsv": "text/tab-separated-values",
    "txt": "text/plain",
    "json": "application/json",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pdf": "application/pdf",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
}
ARCHIVE_EXT = {"zip", "rar", "7z"}


def archive_kind(data: bytes) -> str | None:
    """'zip' | 'rar' | '7z' from the first bytes, or None."""
    if data[:4] == b"PK\x03\x04" or data[:4] == b"PK\x05\x06":
        return "zip"
    if data[:7] == b"Rar!\x1a\x07\x00" or data[:8] == b"Rar!\x1a\x07\x01\x00":
        return "rar"
    if data[:6] == b"7z\xbc\xaf\x27\x1c":
        return "7z"
    return None


class ArchiveError(ValueError):
    """``code``: password_needed | wrong_password | too_big | empty | unreadable | no_tool."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass
class Limits:
    max_files: int = 60
    max_file_bytes: int = 25 * 1024 * 1024          # ClamAV's limit on the VM
    max_total_bytes: int = 300 * 1024 * 1024        # all entries together (zip bombs)
    timeout: float = 120.0


@dataclass
class Unpacked:
    files: list[tuple[str, str, bytes]] = field(default_factory=list)   # (name, mime, bytes)
    skipped: list[tuple[str, str]] = field(default_factory=list)        # (name, reason)
    encrypted: bool = False


def _run(args: list[str], password: str | None, timeout: float) -> tuple[int, str]:
    # -p with an empty value never waits for typing (stdin is closed anyway).
    cmd = [SEVEN_ZIP, *args[:1], "-y", "-bd", f"-p{password or ''}", *args[1:]]
    try:
        p = subprocess.run(cmd, stdin=subprocess.DEVNULL, capture_output=True, timeout=timeout,
                           check=False, env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"),
                                             "LANG": "C.UTF-8"})
    except FileNotFoundError as exc:
        raise ArchiveError("no_tool", "The archive tool is not installed on the analysis server.") from exc
    except subprocess.TimeoutExpired as exc:
        raise ArchiveError("unreadable", "The archive took too long to open.") from exc
    out = (p.stdout or b"").decode("utf-8", "replace") + (p.stderr or b"").decode("utf-8", "replace")
    return p.returncode, out


def _password_problem(out: str, password: str | None) -> ArchiveError | None:
    if "Wrong password" in out or "Cannot open encrypted archive" in out:
        if password:
            return ArchiveError("wrong_password", "That password does not open the archive.")
        return ArchiveError("password_needed", "This archive has a password. Enter it to open the files.")
    return None


def _entries(listing: str) -> list[dict[str, str]]:
    """Parse ``7z l -slt``: blocks of ``Key = value`` after the ``----------`` line."""
    body = listing.split("----------", 1)[-1]
    out, cur = [], {}
    for line in body.splitlines():
        if not line.strip():
            if cur.get("Path"):
                out.append(cur)
            cur = {}
            continue
        if " = " in line:
            k, v = line.split(" = ", 1)
            cur[k.strip()] = v.strip()
    if cur.get("Path"):
        out.append(cur)
    return out


def unpack(data: bytes, password: str | None = None, limits: Limits | None = None,
           depth: int = 0) -> Unpacked:
    lim = limits or Limits()
    kind = archive_kind(data)
    if kind is None:
        raise ArchiveError("unreadable", "This is not a ZIP, RAR or 7z archive.")
    work = Path(tempfile.mkdtemp(prefix="litch-arc-"))
    try:
        os.chmod(work, 0o700)
        src = work / f"upload.{kind}"
        src.write_bytes(data)
        rc, listing = _run(["l", "-slt", str(src)], password, lim.timeout)
        problem = _password_problem(listing, password)
        if problem:
            raise problem
        if rc not in (0, 1):
            raise ArchiveError("unreadable", "The archive could not be opened. It may be damaged.")
        entries = [e for e in _entries(listing) if e.get("Folder", "-") != "+"]
        total = sum(int(e.get("Size") or 0) for e in entries)
        if total > lim.max_total_bytes:
            raise ArchiveError("too_big", "The files inside are too large together (over 300 MB).")
        res = Unpacked(encrypted=any(e.get("Encrypted") == "+" for e in entries))
        if res.encrypted and not password:
            raise ArchiveError("password_needed", "This archive has a password. Enter it to open the files.")
        out = work / "out"
        out.mkdir()
        # "e" = extract without folders (flat): names cannot point outside the folder.
        # -aou renames a second file with the same name instead of overwriting it.
        rc, log = _run(["e", "-aou", f"-o{out}", str(src)], password, lim.timeout)
        problem = _password_problem(log, password)
        if problem:
            raise problem
        if rc not in (0, 1):
            raise ArchiveError("unreadable", "The archive could not be unpacked. It may be damaged.")
        for f in sorted(out.iterdir(), key=lambda p: p.name.lower()):
            if not f.is_file() or f.is_symlink():
                continue
            name = f.name
            ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
            if name.startswith((".", "~$")) or name.startswith("__MACOSX"):
                continue
            if ext in ARCHIVE_EXT:
                # v8: an archive inside the archive is opened too (two levels at most),
                # with the same password and limits
                if depth >= 1:
                    res.skipped.append((name, "an archive three levels deep: unpack it first"))
                    continue
                try:
                    inner = unpack(f.read_bytes(), password, lim, depth + 1)
                except ArchiveError as exc:
                    res.skipped.append((name, str(exc) or "the archive inside could not be opened"))
                    continue
                for iname, imime, idata in inner.files:
                    if len(res.files) >= lim.max_files:
                        res.skipped.append((iname, f"more than {lim.max_files} files"))
                        continue
                    res.files.append((iname, imime, idata))
                res.skipped.extend(inner.skipped)
                res.encrypted = res.encrypted or inner.encrypted
                continue
            mime = MIME_BY_EXT.get(ext)
            if mime is None:
                res.skipped.append((name, "this file type is not read by the workbench"))
                continue
            size = f.stat().st_size
            if size == 0:
                res.skipped.append((name, "empty file"))
                continue
            if size > lim.max_file_bytes:
                res.skipped.append((name, "over 25 MB"))
                continue
            if len(res.files) >= lim.max_files:
                res.skipped.append((name, f"more than {lim.max_files} files"))
                continue
            res.files.append((name, mime, f.read_bytes()))
        if not res.files:
            raise ArchiveError("empty", "No file in the archive can be read by the workbench."
                               + (f" Skipped: {', '.join(n for n, _ in res.skipped[:5])}." if res.skipped else ""))
        return res
    finally:
        shutil.rmtree(work, ignore_errors=True)
