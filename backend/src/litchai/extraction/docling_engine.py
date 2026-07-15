"""Docling PDF/image extraction (Phase 2b) — VM-gated behind the engine protocol.

Docling (layout-aware OCR + table structure) is a heavy, native, ARM64 dep that
lives only on the OCI VM (Phase 0 proved it there). This module stays importable
everywhere — ``docling`` is imported lazily inside :meth:`extract` — so the
registry and the rest of the pipeline don't drag it in. Two registry entries per
the plan: ``docling_text`` (do_ocr=False where a text layer exists) and
``docling_ocr`` (force full-page OCR for scans). Both map extracted table cells
through the **same** header-detection + amount rules as the Excel path, so a
narration is normalized identically regardless of source.

Long scans run as ~6-page ``page_range`` chunks (separate Procrastinate jobs);
``extract(page_range=(start, end))`` is the per-chunk entry.
"""
from __future__ import annotations

from decimal import Decimal

from litchai.extraction.base import (
    ExtractedRow,
    ExtractionError,
    ExtractionResult,
    register_engine,
)
from litchai.extraction.excel import _classify, _detect_header, _row_amount


def _docling_convert(data: bytes, *, force_ocr: bool, page_range: tuple[int, int] | None):
    """Run Docling; imported lazily (VM-only). Returns the converted document."""
    try:
        from docling.datamodel.base_models import InputFormat  # noqa: PLC0415
        from docling.datamodel.pipeline_options import PdfPipelineOptions  # noqa: PLC0415
        from docling.document_converter import DocumentConverter, PdfFormatOption  # noqa: PLC0415
    except ImportError as exc:  # pragma: no cover - VM-only path
        raise ExtractionError("docling is not installed (VM-only dependency)") from exc

    import io  # noqa: PLC0415

    from docling.datamodel.base_models import DocumentStream  # noqa: PLC0415

    options = PdfPipelineOptions(do_ocr=force_ocr, do_table_structure=True)
    if force_ocr:  # scanned pages: OCR the whole page (Phase 0 recipe)
        from docling.datamodel.pipeline_options import TesseractOcrOptions  # noqa: PLC0415

        options.ocr_options = TesseractOcrOptions(force_full_page_ocr=True)
    converter = DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)}
    )
    kwargs = {}
    if page_range is not None:
        kwargs["page_range"] = page_range
    return converter.convert(DocumentStream(name="upload.pdf", stream=io.BytesIO(data)), **kwargs)


def _tables_to_rows(document) -> list[tuple]:  # pragma: no cover - VM-only path
    """Flatten every extracted table into rows of cell strings (like a sheet)."""
    rows: list[tuple] = []
    for table in getattr(document, "tables", []):
        grid = table.export_to_dataframe()
        rows.append(tuple(str(c) for c in grid.columns))  # header row
        for _, record in grid.iterrows():
            rows.append(tuple("" if v is None else str(v) for v in record.tolist()))
    return rows


class _DoclingEngine:
    def __init__(self, name: str, *, force_ocr: bool, handles_images: bool) -> None:
        self.name = name
        self._force_ocr = force_ocr
        self._handles_images = handles_images

    def can_handle(self, mime: str, filename: str) -> bool:
        if mime == "application/pdf" or filename.lower().endswith(".pdf"):
            return True
        return self._handles_images and mime.startswith("image/")

    def extract(  # pragma: no cover - VM-only path
        self, data: bytes, *, page_range: tuple[int, int] | None = None
    ) -> ExtractionResult:
        result = _docling_convert(data, force_ocr=self._force_ocr, page_range=page_range)
        rows_raw = _tables_to_rows(result.document)
        header_idx, roles = _detect_header(rows_raw)
        if header_idx is None:
            raise ExtractionError("docling: no recognizable table header")

        page = page_range[0] if page_range else None
        rows: list[ExtractedRow] = []
        for offset, raw in enumerate(rows_raw[header_idx + 1 :], start=1):
            amount, flags = _row_amount(raw, roles)
            if amount is None:
                continue
            desc_col = roles.get("description", 0)
            desc = str(raw[desc_col]).strip() if desc_col < len(raw) else ""
            bal = None
            if "balance" in roles and roles["balance"] < len(raw):
                from litchai.sanitize import parse_amount  # noqa: PLC0415

                parsed = parse_amount(raw[roles["balance"]])
                bal = parsed.value if parsed else None
            rows.append(
                ExtractedRow(
                    raw_text=desc or "(no narration)",
                    amount=amount if isinstance(amount, Decimal) else Decimal(str(amount)),
                    balance=bal,
                    page_ref=page,
                    flags=tuple(flags),
                )
            )
        return ExtractionResult(engine=self.name, rows=rows, sheet_type=_classify(roles))


# Registration order = selection priority: text path preferred for PDFs, OCR is
# the fallback and the only image handler.
register_engine(_DoclingEngine("docling_text", force_ocr=False, handles_images=False))
register_engine(_DoclingEngine("docling_ocr", force_ocr=True, handles_images=True))
