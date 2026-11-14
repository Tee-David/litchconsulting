"""Archives: ZIP, RAR and 7z, with or without a password (litchai/archives.py).
Needs the 7-Zip program; skipped where it is not installed."""
from __future__ import annotations

import io
import shutil
import subprocess
import zipfile

import pytest
from fastapi.testclient import TestClient
from test_documents_api import CLIENT, _harness

from litchai.archives import ArchiveError, Limits, archive_kind, unpack
from litchai.queue import queue

pytestmark = pytest.mark.skipif(not (shutil.which("7z") or shutil.which("7zz")), reason="7-Zip not installed")


def _zip(files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for n, b in files.items():
            z.writestr(n, b)
    return buf.getvalue()


def _aes_zip(tmp_path, password: str) -> bytes:
    (tmp_path / "bank.csv").write_text("date,amount\n2025-01-01,100\n")
    out = tmp_path / "secret.zip"
    exe = shutil.which("7z") or shutil.which("7zz")
    subprocess.run([exe, "a", "-tzip", f"-p{password}", "-mem=AES256", str(out), str(tmp_path / "bank.csv")],
                   check=True, capture_output=True)
    return out.read_bytes()


def test_kind_and_plain_zip_with_skips():
    data = _zip({"ledger/tb.csv": b"a,b\n1,2\n", "notes.exe": b"MZ", "inner.zip": _zip({"x.csv": b"1"}),
                 "__MACOSX/._tb.csv": b"junk", "empty.csv": b""})
    assert archive_kind(data) == "zip" and archive_kind(b"%PDF") is None
    res = unpack(data)
    assert [n for n, _, _ in res.files] == ["tb.csv"]          # flat: no folders
    reasons = dict(res.skipped)
    assert "archive inside" in reasons["inner.zip"] and "not read" in reasons["notes.exe"]
    assert reasons["empty.csv"] == "empty file" and not res.encrypted


def test_password_zip_needs_the_right_password(tmp_path):
    data = _aes_zip(tmp_path, "s3cret")
    with pytest.raises(ArchiveError) as e:
        unpack(data)
    assert e.value.code == "password_needed"
    with pytest.raises(ArchiveError) as e:
        unpack(data, "wrong")
    assert e.value.code == "wrong_password"
    res = unpack(data, "s3cret")
    assert res.encrypted and res.files[0][0] == "bank.csv" and res.files[0][2].startswith(b"date,amount")


def test_limits_stop_a_bomb_and_too_many_files():
    with pytest.raises(ArchiveError) as e:
        unpack(_zip({"a.csv": b"0" * 5000}), limits=Limits(max_total_bytes=1000))
    assert e.value.code == "too_big"
    res = unpack(_zip({f"f{i}.csv": b"1" for i in range(5)}), limits=Limits(max_files=2))
    assert len(res.files) == 2 and len(res.skipped) == 3
    with pytest.raises(ArchiveError) as e:
        unpack(_zip({"only.exe": b"MZ"}))
    assert e.value.code == "empty"


def test_unpack_endpoint_makes_one_document_per_file(tmp_path):
    repo, conn, app = _harness(tmp_path)
    data = _zip({"tb.csv": b"a,b\n1,2\n", "bank.csv": b"x,y\n3,4\n"})
    with queue.replace_connector(conn), TestClient(app) as client:
        r = client.post("/archives/unpack", params={"client_id": CLIENT, "filename": "books.zip"},
                        content=data, headers={"content-type": "application/octet-stream"})
        assert r.status_code == 201, r.text
        body = r.json()
        assert sorted(d["filename"] for d in body["documents"]) == ["bank.csv", "tb.csv"]
        assert all(d["status"] == "received" for d in body["documents"])
        bad = client.post("/archives/unpack", params={"client_id": CLIENT, "filename": "x.zip"},
                          content=_aes_zip(tmp_path, "pw"), headers={"content-type": "application/octet-stream"})
        assert bad.status_code == 401 and bad.json()["detail"]["code"] == "password_needed"
        ok = client.post("/archives/unpack", params={"client_id": CLIENT, "filename": "x.zip"},
                         content=_aes_zip(tmp_path, "pw"),
                         headers={"content-type": "application/octet-stream", "X-Archive-Password": "pw"})
        assert ok.status_code == 201 and ok.json()["encrypted"] is True
