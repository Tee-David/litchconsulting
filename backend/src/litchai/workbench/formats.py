"""File formats → an xlsx working copy (research plan §8).

The workbench works on xlsx. Every other file becomes an xlsx *working copy*;
the original stays untouched in storage and is cited by its file name. Each
conversion reports, in plain words, what it did and what was lost.

=====================  ============================================================
.xlsx / .xlsm          used as is
.csv / .tsv / .txt     delimiter, encoding (UTF-8, UTF-16, Windows-1252), decimal
                       style ("1,000.00" vs "1.000,00") and date order (dd/mm vs
                       mm/dd) are detected; a .txt that is not a table becomes notes
.json                  a list of records (or the first list of records inside an
                       object) becomes a table; anything else becomes notes
.docx                  every table becomes a sheet; the text goes to a Notes sheet
.xls / .ods            converted by headless LibreOffice on the VM
=====================  ============================================================

All file text is DATA, never instructions: it only ever lands in cells.
"""
from __future__ import annotations

import codecs
import csv
import io
import json
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

from litchai.workbench.model import Cell, Sheet, Workbook, load_xlsx, to_xlsx_bytes

MAX_TEXT_BYTES = 20 * 1024 * 1024
MAX_ROWS = 200_000
NOTES_SHEET = "Notes"

XLSX_EXT = (".xlsx", ".xlsm")
DELIMITED_EXT = (".csv", ".tsv", ".txt")
OFFICE_EXT = (".xls", ".ods")
WORKBENCH_EXT = XLSX_EXT + DELIMITED_EXT + OFFICE_EXT + (".json", ".docx")

MIME_EXT = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-excel.sheet.macroenabled.12": ".xlsm",
    "text/csv": ".csv",
    "text/tab-separated-values": ".tsv",
    "text/plain": ".txt",
    "application/json": ".json",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.oasis.opendocument.spreadsheet": ".ods",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}


class FormatError(ValueError):
    """The file cannot become a working copy (the message is for the user)."""


@dataclass
class Converted:
    xlsx: bytes
    origin: str                       # xlsx | csv | tsv | txt | json | docx | xls | ods
    converted: bool
    notes: list[str] = field(default_factory=list)

    def source(self, filename: str) -> dict[str, Any]:
        return {"filename": filename, "format": self.origin, "converted": self.converted,
                "notes": self.notes}


def extension(filename: str, mime: str | None = None) -> str:
    low = (filename or "").lower()
    for ext in WORKBENCH_EXT:
        if low.endswith(ext):
            return ext
    return MIME_EXT.get((mime or "").lower(), "")


def is_workbench_file(filename: str, mime: str | None = None) -> bool:
    return extension(filename, mime) != ""


def to_working_copy(data: bytes, filename: str, mime: str | None = None, *,
                    wb_id: str = "file", document_id: int | None = None) -> Converted:
    ext = extension(filename, mime)
    if ext in XLSX_EXT:
        load_xlsx(data, wb_id=wb_id, name=filename)  # opens, or raises
        return Converted(data, "xlsx", converted=False)
    if ext in OFFICE_EXT:
        out = soffice_to_xlsx(data, ext)
        kind = ext[1:]
        return Converted(out, kind, converted=True, notes=[
            (f"Converted from {kind.upper()} to XLSX with LibreOffice. Values and formulas are "
            "kept; macros, some formatting and embedded images may be lost. The original file "
            "is unchanged.")])
    if len(data) > MAX_TEXT_BYTES:
        raise FormatError(f"{filename} is too large to read as text (over 20 MB).")
    if ext == ".json":
        wb, notes = json_workbook(data, wb_id=wb_id, name=filename, document_id=document_id)
        return Converted(to_xlsx_bytes(wb), "json", converted=True, notes=notes)
    if ext == ".docx":
        wb, notes = docx_workbook(data, wb_id=wb_id, name=filename, document_id=document_id)
        return Converted(to_xlsx_bytes(wb), "docx", converted=True, notes=notes)
    if ext in DELIMITED_EXT:
        wb, notes = delimited_workbook(data, wb_id=wb_id, name=filename, document_id=document_id,
                                       hint="\t" if ext == ".tsv" else None,
                                       allow_notes=ext == ".txt")
        return Converted(to_xlsx_bytes(wb), ext[1:], converted=True, notes=notes)
    raise FormatError(f"{filename}: this file type cannot be opened in the workbench.")


# --- text decoding ----------------------------------------------------------------
def decode_text(data: bytes) -> tuple[str, str]:
    """(text, encoding). BOMs first, then UTF-16 without a BOM (many NUL bytes),
    then strict UTF-8, then Windows-1252 (which accepts any byte)."""
    if data.startswith(codecs.BOM_UTF8):
        return data[3:].decode("utf-8", errors="replace"), "utf-8"
    if data.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
        return data.decode("utf-16", errors="replace"), "utf-16"
    sample = data[:4000]
    if sample and sample.count(b"\x00") > len(sample) // 4:
        le = sample[1::2].count(0) > sample[0::2].count(0)
        return data.decode("utf-16-le" if le else "utf-16-be", errors="replace"), "utf-16"
    try:
        return data.decode("utf-8"), "utf-8"
    except UnicodeDecodeError:
        return data.decode("cp1252", errors="replace"), "windows-1252"


# --- delimited text ---------------------------------------------------------------
_DELIMS = [",", ";", "\t", "|"]
_COMMA_DECIMAL = re.compile(r"^[-(]?\d{1,3}(?:\.\d{3})+,\d+\)?$|^[-(]?\d+,\d{1,2}\)?$")
_DOT_DECIMAL = re.compile(r"^[-(]?\d{1,3}(?:,\d{3})+(?:\.\d+)?\)?$|^[-(]?\d+\.\d+\)?$")
_DATE = re.compile(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$")
_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
_NUM_CHARS = re.compile(r"[₦$€£\s]|NGN", re.IGNORECASE)


def sniff_delimiter(text: str, hint: str | None = None) -> str | None:
    """The delimiter that splits most lines into the same number (≥ 2) of fields."""
    if hint:
        return hint
    lines = [ln for ln in text.splitlines()[:50] if ln.strip()]
    if not lines:
        return None
    best, best_score = None, 0.0
    for d in _DELIMS:
        counts = [len(next(csv.reader([ln], delimiter=d))) for ln in lines]
        common = max(set(counts), key=counts.count)
        if common < 2:
            continue
        score = counts.count(common) / len(counts) + common / 1000
        if score > best_score:
            best, best_score = d, score
    return best if best_score >= 0.6 else None


def number_style(cells: list[str]) -> str:
    """'comma' when amounts look like 1.000,00 or 12,50; else 'dot'."""
    comma = dot = 0
    for v in cells:
        s = _NUM_CHARS.sub("", v)
        if _COMMA_DECIMAL.match(s):
            comma += 1
        elif _DOT_DECIMAL.match(s):
            dot += 1
    return "comma" if comma > dot else "dot"


def date_order(cells: list[str]) -> tuple[str, bool]:
    """('dmy' | 'mdy', ambiguous). A first part over 12 proves dd/mm; a second
    part over 12 proves mm/dd. With no proof, Nigerian dd/mm is used."""
    dmy = mdy = 0
    for v in cells:
        m = _DATE.match(v.strip())
        if not m:
            continue
        a, b = int(m.group(1)), int(m.group(2))
        if a > 12 >= b:
            dmy += 1
        elif b > 12 >= a:
            mdy += 1
    if mdy > dmy:
        return "mdy", False
    return "dmy", dmy == 0


def parse_value(v: str, *, decimal: str, order: str) -> Any:
    s = v.strip()
    if not s:
        return None
    m = _ISO.match(s)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return s
    m = _DATE.match(s)
    if m:
        a, b, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        y = y + 2000 if y < 100 else y
        day, month = (a, b) if order == "dmy" else (b, a)
        try:
            return date(y, month, day)
        except ValueError:
            return s
    n = _NUM_CHARS.sub("", s)
    neg = n.startswith("(") and n.endswith(")")
    if neg:
        n = n[1:-1]
    n = n.replace(".", "").replace(",", ".") if decimal == "comma" else n.replace(",", "")
    if re.fullmatch(r"0\d+", n):  # account / phone numbers keep their leading zero
        return s
    if re.fullmatch(r"-?\d+(?:\.\d+)?", n):
        f = float(n)
        f = -f if neg else f
        return int(f) if f.is_integer() and "." not in n else f
    return s


def delimited_workbook(data: bytes, *, wb_id: str, name: str, document_id: int | None = None,
                       hint: str | None = None, allow_notes: bool = False
                       ) -> tuple[Workbook, list[str]]:
    text, enc = decode_text(data)
    delim = sniff_delimiter(text, hint)
    if delim is None:
        if not allow_notes:
            raise FormatError(f"{name}: no column separator was found, so it is not a table.")
        return _notes_workbook(text.splitlines(), wb_id=wb_id, name=name,
                               document_id=document_id), [
            (f"Read as text ({enc}). It is not a table, so each line is a row on the "
            f"{NOTES_SHEET} sheet.")]
    rows = list(csv.reader(io.StringIO(text), delimiter=delim))[:MAX_ROWS]
    flat = [c for r in rows[1:200] for c in r if c.strip()]
    decimal = number_style(flat)
    order, ambiguous = date_order(flat)
    sheet = Sheet("Sheet1")
    for r, row in enumerate(rows, start=1):
        for c, v in enumerate(row, start=1):
            val = parse_value(v, decimal=decimal, order=order)
            if val is not None:
                sheet.set(r, c, Cell(value=val))
    label = {",": "comma", ";": "semicolon", "\t": "tab", "|": "pipe"}[delim]
    notes = [f"Read as a {label}-separated table ({enc}); numbers use "
             f"{'1.000,00' if decimal == 'comma' else '1,000.00'} style; dates read as "
             f"{'dd/mm/yyyy' if order == 'dmy' else 'mm/dd/yyyy'}"
             + (" (no date proved the order, so the Nigerian dd/mm order was used)."
                if ambiguous and any(_DATE.match(c.strip()) for c in flat) else ".")]
    return Workbook(id=wb_id, name=name, sheets={"Sheet1": sheet}, document_id=document_id,
                    origin="csv"), notes


def _notes_workbook(lines: list[str], *, wb_id: str, name: str,
                    document_id: int | None) -> Workbook:
    sheet = Sheet(NOTES_SHEET)
    r = 0
    for ln in lines[:MAX_ROWS]:
        if ln.strip():
            r += 1
            sheet.set(r, 1, Cell(value=ln.strip()[:32000]))
    return Workbook(id=wb_id, name=name, sheets={NOTES_SHEET: sheet}, document_id=document_id,
                    origin="notes")


# --- json -------------------------------------------------------------------------
def _records(obj: Any) -> tuple[list[dict[str, Any]] | None, str]:
    if isinstance(obj, list) and obj and all(isinstance(x, dict) for x in obj):
        return obj, ""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, list) and v and all(isinstance(x, dict) for x in v):
                return v, k
    return None, ""


def json_workbook(data: bytes, *, wb_id: str, name: str, document_id: int | None = None
                  ) -> tuple[Workbook, list[str]]:
    text, _enc = decode_text(data)
    try:
        obj = json.loads(text)
    except json.JSONDecodeError as exc:
        raise FormatError(f"{name} is not valid JSON (line {exc.lineno}).") from exc
    recs, key = _records(obj)
    if recs is None:
        lines = json.dumps(obj, indent=2, ensure_ascii=False, default=str).splitlines()
        return _notes_workbook(lines, wb_id=wb_id, name=name, document_id=document_id), [
            (f"The JSON is not a list of records, so it is shown as text on the {NOTES_SHEET} "
            "sheet.")]
    headers: list[str] = []
    for rec in recs[:MAX_ROWS]:
        for k in rec:
            if k not in headers:
                headers.append(str(k))
    sheet = Sheet("Sheet1")
    for c, h in enumerate(headers, start=1):
        sheet.set(1, c, Cell(value=h))
    nested = False
    for r, rec in enumerate(recs[:MAX_ROWS], start=2):
        for c, h in enumerate(headers, start=1):
            v = rec.get(h)
            if isinstance(v, (dict, list)):
                nested = True
                v = json.dumps(v, ensure_ascii=False, default=str)
            elif isinstance(v, str):
                v = parse_value(v, decimal="dot", order="dmy")
            if v is not None:
                sheet.set(r, c, Cell(value=v))
    where = f' (the "{key}" list)' if key else ""
    notes = [f"Read {len(recs)} JSON records{where} as a table with {len(headers)} columns."]
    if nested:
        notes.append("Nested values are kept as JSON text in their cells.")
    return Workbook(id=wb_id, name=name, sheets={"Sheet1": sheet}, document_id=document_id,
                    origin="json"), notes


# --- docx -------------------------------------------------------------------------
def docx_workbook(data: bytes, *, wb_id: str, name: str, document_id: int | None = None
                  ) -> tuple[Workbook, list[str]]:
    from litchai.extraction.sandbox import check_zip_safety

    try:
        check_zip_safety(data)
        import docx  # python-docx

        doc = docx.Document(io.BytesIO(data))
    except Exception as exc:
        raise FormatError(f"{name} could not be opened as a Word document.") from exc
    sheets: dict[str, Sheet] = {}
    for i, table in enumerate(doc.tables, start=1):
        sheet = Sheet(f"Table {i}")
        for r, row in enumerate(table.rows, start=1):
            prev = None
            for c, cell in enumerate(row.cells, start=1):
                if cell._tc is prev:  # a merged cell repeats: keep the first copy
                    continue
                prev = cell._tc
                v = parse_value(cell.text, decimal="dot", order="dmy")
                if v is not None:
                    sheet.set(r, c, Cell(value=v))
        sheets[sheet.name] = sheet
    paras = [p.text for p in doc.paragraphs if p.text.strip()]
    if paras:
        notes_sheet = _notes_workbook(paras, wb_id=wb_id, name=name,
                                      document_id=document_id).sheets[NOTES_SHEET]
        sheets[NOTES_SHEET] = notes_sheet
    if not sheets:
        raise FormatError(f"{name} has no tables and no text.")
    notes = [f"Read {len(doc.tables)} table(s) from the Word document, one sheet each"
             + (f"; the text ({len(paras)} paragraphs) is on the {NOTES_SHEET} sheet." if paras
                else ".")
             + " Formatting and images are not kept."]
    return Workbook(id=wb_id, name=name, sheets=sheets, document_id=document_id,
                    origin="docx"), notes


# --- xls / ods via LibreOffice ----------------------------------------------------
def soffice_to_xlsx(data: bytes, ext: str, timeout: int = 120) -> bytes:
    if shutil.which("soffice") is None:
        raise FormatError(f"{ext.upper()[1:]} files need LibreOffice on the analysis server, "
                          "and it is not installed. Save the file as .xlsx and add it again.")
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / f"source{ext}"
        src.write_bytes(data)
        profile = Path(tmp) / "profile"
        cmd = ["soffice", "--headless", "--norestore", f"-env:UserInstallation=file://{profile}",
               "--convert-to", "xlsx:Calc MS Excel 2007 XML", "--outdir", tmp, str(src)]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout,
                                  check=False)
        except subprocess.TimeoutExpired as exc:
            raise FormatError("The conversion took too long. Save the file as .xlsx and add "
                              "it again.") from exc
        out = Path(tmp) / "source.xlsx"
        if proc.returncode != 0 or not out.exists():
            raise FormatError("LibreOffice could not convert this file. Save it as .xlsx and "
                              "add it again.")
        return out.read_bytes()
