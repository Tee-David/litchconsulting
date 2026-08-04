"""AI-in-the-spreadsheet for the Analyses editor (Wave 2, Step 2).

The editor never ships the whole workbook to the model — only a *selection*: its
A1 range, the column headers, and the displayed cell values (plus any formulas).
An LLM proposes structured cell edits under a strict JSON schema; every proposed
FORMULA is then smoke-tested by writing the selection back into a throwaway
workbook at its real coordinates, recomputing it through LibreOffice and scanning
for error tokens — so a formula that would blow up (``#REF!``, ``#DIV/0!`` …)
comes back as a *warning*, not an applied edit.

The number is proposed by generation but **checked deterministically** — the same
contract the compile pipeline uses (see ``review/corrections.py``). Edits are only
ever *proposals*: the editor previews them and a human applies them.
"""
from __future__ import annotations

import logging
import re

from litchai.ai.cache import AiCache, AiTelemetry
from litchai.ai.harness import run_task
from litchai.ai.provider import Provider
from litchai.ai.tasks import TaskPolicy, TaskSpec
from pydantic import BaseModel

log = logging.getLogger(__name__)

# The first six commands the editor exposes (Step 2c).
COMMANDS: tuple[str, ...] = (
    "explain",
    "write_formula",
    "clean_normalise",
    "add_column",
    "flag_anomalies",
    "categorise",
)

# Diagnostic commands: their deliverable is the prose, and the brief tells the
# model to return no edits. Enforced (not merely requested) in _sanitize_edits.
READ_ONLY_COMMANDS: frozenset[str] = frozenset({"explain", "flag_anomalies"})

# A cell address we will accept from the model: a plain A1 ref on the ACTIVE
# sheet, optionally $-anchored. Deliberately rejects sheet-qualified ("S2!A1")
# and range ("B4:B9") forms — neither is applicable one-cell-per-edit, and both
# would otherwise be silently dropped by the editor's stricter parser.
_A1_RE = re.compile(r"^\$?([A-Za-z]{1,3})\$?([1-9][0-9]{0,6})$")

MAX_EDITS = 500                # a selection command should never rewrite more
MAX_INSTRUCTION_CHARS = 2000   # the only free-text field; bound the prompt
_MAX_ROWS_SHOWN = 60

# Per-command brief injected into the prompt so one template covers all six.
_COMMAND_BRIEF: dict[str, str] = {
    "explain": (
        "EXPLAIN this selection: what the columns hold and how any formulas work. "
        "Return NO edits — put the explanation in `explanation`."
    ),
    "write_formula": (
        "WRITE or FIX a formula per the user instruction. Return only the formula "
        "edits needed; prefer a single formula that fills the natural target cell."
    ),
    "clean_normalise": (
        "CLEAN & NORMALISE the selected values: trim whitespace, fix obvious casing, "
        "standardise dates and numbers. Return one `value` edit per cell you change."
    ),
    "add_column": (
        "ADD A DERIVED COLUMN immediately to the RIGHT of the selection per the "
        "instruction. Include a header cell and one edit per row; use formulas where "
        "the column is computed."
    ),
    "flag_anomalies": (
        "FLAG ANOMALIES: outliers, sign errors, broken subtotals, duplicates, stale "
        "dates. Return NO edits — list each finding in `warnings` and summarise in "
        "`explanation`."
    ),
    "categorise": (
        "CATEGORISE each row into an accounting category. Add a 'Category' column to "
        "the RIGHT of the selection: one `value` edit per row holding the category, "
        "plus a header edit. Keep categories consistent across similar rows."
    ),
}


class SelectionEdit(BaseModel):
    cell: str                     # absolute A1, within or just right of the selection
    value: str | None = None
    formula: str | None = None    # starts with "="; never set together with value


class SelectionResult(BaseModel):
    edits: list[SelectionEdit] = []
    explanation: str = ""
    warnings: list[str] = []


def _selection_schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "edits": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "cell": {"type": "string"},
                        "value": {"type": ["string", "null"]},
                        "formula": {"type": ["string", "null"]},
                    },
                    "required": ["cell"],
                },
            },
            "explanation": {"type": "string"},
            "warnings": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["edits", "explanation", "warnings"],
    }


def _selection_spec() -> TaskSpec:
    return TaskSpec(
        name="assistant_selection",
        # v2: extent note, escaped grid, value-first formulas, injection rule.
        # The version is part of the cache key — bumping it retires v1 answers.
        prompt_version="v2",
        prompt_file="assistant_selection.md",
        output_model=SelectionResult,
        output_schema=_selection_schema(),
        # Deterministic edits, but the grids can be wide — give it more context.
        policy=TaskPolicy(num_ctx=8192),
    )


def _coerce(val: object) -> object:
    """Best-effort string→number so recompute evaluates formulas over real values."""
    if val is None:
        return None
    s = str(val).strip()
    if not s:
        return None
    cleaned = s.replace(",", "").replace("₦", "").replace("$", "").strip()
    try:
        f = float(cleaned)
        return int(f) if f.is_integer() else f
    except ValueError:
        return s


def parse_a1(ref: str) -> tuple[int, int] | None:
    """'B4' / '$B$4' -> (4, 2); anything else (ranges, sheet-qualified refs,
    garbage) -> None. 1-indexed (row, col)."""
    m = _A1_RE.match((ref or "").strip())
    if m is None:
        return None
    col = 0
    for ch in m.group(1).upper():
        col = col * 26 + (ord(ch) - 64)
    return int(m.group(2)), col


def selection_start(selection_a1: str) -> tuple[int, int]:
    """Top-left cell of a selection as 1-indexed (row, col); (1, 1) on garbage."""
    return parse_a1((selection_a1 or "").split(":")[0]) or (1, 1)


def allowed_region(
    selection_a1: str, nrows: int, ncols: int
) -> tuple[int, int, int, int]:
    """The rectangle an edit may legally land in: the selection itself, plus ONE
    row below and ONE column to the right.

    That margin is deliberate and matches the prompt contract — ``add_column``
    writes a derived column immediately right of the selection, and a total
    naturally lands in the row directly beneath it. Anything further out is a
    model that has lost the plot, or a prompt injection from cell content.
    Returns 1-indexed (row_start, col_start, row_end, col_end) inclusive.
    """
    start_row, start_col = selection_start(selection_a1)
    return (
        start_row,
        start_col,
        start_row + max(nrows, 1),      # one row below the last selected row
        start_col + max(ncols, 1),      # one column right of the last selected col
    )


def _escape_cell(text: str) -> str:
    r"""Escape anything that would tear the grid's line/column structure apart.

    One grid row must always be exactly one physical line, and one cell exactly
    one column — otherwise a cell containing a newline or a pipe silently
    scrambles the model's view of which value sits at which address. Escapes
    round-trip: a literal ``\n`` the model writes back means an in-cell break.
    """
    return (
        text.replace("\\", "\\\\")
        .replace("\t", "\\t")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
        .replace("\r", "\\n")
        .replace("|", "\\|")
    )


def _render_extent(selection_a1: str, nrows: int, ncols: int, shown: int) -> str:
    """State the AUTHORITATIVE size of the selection.

    Without this the model infers row counts from whatever window it happened to
    be shown and reports them as fact ("you have 60 transactions") — the single
    most common hallucination in spreadsheet agents.
    """
    line = (
        f"{selection_a1} holds {nrows} data row(s) × {ncols} column(s). "
        "This is the authoritative extent."
    )
    if shown < nrows:
        line += (
            f" ONLY the first {shown} row(s) are shown below — the remaining "
            f"{nrows - shown} are withheld. Never state a row count, total or "
            "conclusion about the full selection from this partial view; if the "
            "command needs every row, say so in `warnings` instead."
        )
    return line


def _render_table(
    selection_a1: str,
    headers: list[str],
    rows: list[list[str]],
    formulas: list[list[str | None]] | None,
    max_rows: int = _MAX_ROWS_SHOWN,
) -> str:
    """Render the selection as a compact table keyed by real A1 column letters and
    row numbers, so the model references cells unambiguously.

    A formula cell renders **value first, formula as provenance** —
    ``1,200 (=C4*1.075)``. Values-only would let the model overwrite live
    formulas with hardcoded numbers (the most destructive thing it can do to a
    financial model); formulas-only would leave it unable to sanity-check
    magnitudes.
    """
    from openpyxl.utils.cell import get_column_letter

    start_row, start_col = selection_start(selection_a1)

    ncols = max((len(r) for r in rows), default=len(headers))
    ncols = max(ncols, 1)
    col_letters = [get_column_letter(start_col + c) for c in range(ncols)]

    lines = ["      | " + " | ".join(col_letters)]
    if any(h.strip() for h in headers):
        hdr = [_escape_cell(headers[c]) if c < len(headers) else "" for c in range(ncols)]
        lines.append("(name)| " + " | ".join(hdr))
    for i, row in enumerate(rows[:max_rows]):
        rownum = start_row + i
        cells = []
        for c in range(ncols):
            v = _escape_cell(str(row[c])) if c < len(row) else ""
            fx = ""
            if formulas and i < len(formulas) and c < len(formulas[i]):
                raw = formulas[i][c]
                # str(None) == "None" is truthy — a null MUST be filtered before
                # stringifying, or every plain cell claims to hold "=None".
                if raw is not None and str(raw).strip():
                    token = str(raw).strip()
                    fx = f" ({token if token.startswith('=') else '=' + token})"
            if fx:
                cells.append(f"{v}{fx}")       # value first, formula as provenance
            else:
                cells.append(v or "(empty)")   # distinguish blank from "we omitted it"
        lines.append(f"{rownum:>5} | " + " | ".join(cells))
    if len(rows) > max_rows:
        lines.append(f"… ({len(rows) - max_rows} more row(s) withheld — see the extent note above)")
    return "\n".join(lines)


def _a1(row: int, col: int) -> str:
    from openpyxl.utils.cell import get_column_letter

    return f"{get_column_letter(col)}{row}"


def _sanitize_edits(
    command: str,
    selection_a1: str,
    nrows: int,
    ncols: int,
    edits: list[SelectionEdit],
) -> tuple[list[SelectionEdit], list[str]]:
    """Drop every edit we cannot vouch for, and say why.

    Nothing upstream constrains what the model returns: ``cell`` is a free string,
    ``value``/``formula`` are independently optional, and a diagnostic command is
    only *asked* to stay read-only. Cell values also come from client-uploaded
    workbooks, so a crafted cell can try to talk the model into writing somewhere
    it shouldn't. This is the chokepoint that makes those cases inert.

    Fails safe rather than rejecting the whole response: a bad edit is discarded
    with a warning, and the explanation plus the good edits still reach the
    reviewer. (A ``business_rules`` rejection would discard everything, and the
    harness does not retry rule rejects — see ``ai/tasks.py``.)
    """
    warnings: list[str] = []

    if command in READ_ONLY_COMMANDS:
        if edits:
            warnings.append(
                f"`{command}` is diagnostic and must not edit cells — discarded "
                f"{len(edits)} proposed edit(s)."
            )
        return [], warnings

    r1, c1, r2, c2 = allowed_region(selection_a1, nrows, ncols)
    clean: list[SelectionEdit] = []
    bad_address: list[str] = []
    out_of_range: list[str] = []

    for edit in edits:
        if edit.value is None and edit.formula is None:
            continue                                  # nothing to write
        addr = parse_a1(edit.cell)
        if addr is None:
            bad_address.append(edit.cell)
            continue
        row, col = addr
        if not (r1 <= row <= r2 and c1 <= col <= c2):
            out_of_range.append(edit.cell)
            continue
        formula, value = edit.formula, edit.value
        if formula is not None and value is not None:
            # The prompt forbids both; both consumers resolve formula-first, so
            # make that explicit rather than letting the value vanish silently.
            warnings.append(
                f"{edit.cell}: both a value and a formula were proposed — kept the formula."
            )
            value = None
        if formula is not None and not formula.startswith("="):
            formula = "=" + formula
        clean.append(SelectionEdit(cell=edit.cell.replace("$", ""), value=value, formula=formula))

    if bad_address:
        warnings.append(
            "Discarded edit(s) with an unusable cell address: "
            + ", ".join(repr(a) for a in bad_address[:5])
            + ("…" if len(bad_address) > 5 else "")
        )
    if out_of_range:
        warnings.append(
            f"Discarded edit(s) outside the selection and its margin "
            f"({_a1(r1, c1)}:{_a1(r2, c2)}): "
            + ", ".join(out_of_range[:5])
            + ("…" if len(out_of_range) > 5 else "")
        )
    if len(clean) > MAX_EDITS:
        warnings.append(
            f"Proposal capped at {MAX_EDITS} edits ({len(clean) - MAX_EDITS} dropped) — "
            "run the command over a smaller selection."
        )
        clean = clean[:MAX_EDITS]
    return clean, warnings


def run_selection_command(
    *,
    command: str,
    selection_a1: str,
    sheet_name: str | None,
    headers: list[str],
    rows: list[list[str]],
    formulas: list[list[str | None]] | None = None,
    instruction: str | None,
    provider: Provider,
    cache: AiCache | None = None,
    telemetry: AiTelemetry | None = None,
) -> SelectionResult:
    """Ask the model for a structured cell-edit proposal for the selection.

    Degrades gracefully: a provider error or an unparseable answer returns an
    empty proposal with a warning rather than raising (Step 2 safety)."""
    if command not in COMMANDS:
        raise ValueError(f"unknown command {command!r}")

    nrows = len(rows)
    ncols = max((len(r) for r in rows), default=len(headers))
    shown = min(nrows, _MAX_ROWS_SHOWN)
    instruction_text = (instruction or "").strip()
    truncated_instruction = len(instruction_text) > MAX_INSTRUCTION_CHARS

    inputs = {
        "command": command,
        "command_brief": _COMMAND_BRIEF[command],
        "sheet_name": (sheet_name or "Sheet1"),
        "selection_a1": selection_a1,
        "headers": ", ".join(h for h in headers if h.strip()) or "(none)",
        "instruction": instruction_text[:MAX_INSTRUCTION_CHARS] or "(none)",
        "extent": _render_extent(selection_a1, nrows, max(ncols, 1), shown),
        "table": _render_table(selection_a1, headers, rows, formulas),
    }
    try:
        result = run_task(
            _selection_spec(), inputs, provider=provider, cache=cache, telemetry=telemetry
        )
    except Exception as exc:  # provider down / network — never 500 the editor
        log.warning("selection command %s failed: %s", command, exc)
        return SelectionResult(
            warnings=[f"The assistant is unavailable right now ({type(exc).__name__})."]
        )
    if result.ok and isinstance(result.model, SelectionResult):
        model = result.model
        model.edits, notes = _sanitize_edits(
            command, selection_a1, nrows, max(ncols, 1), model.edits
        )
        if shown < nrows:
            notes.append(
                f"Only the first {shown} of {nrows} rows were sent to the assistant."
            )
        if truncated_instruction:
            notes.append(
                f"Your instruction was truncated to {MAX_INSTRUCTION_CHARS} characters."
            )
        model.warnings = [*model.warnings, *notes]
        return model
    return SelectionResult(
        warnings=["Couldn't produce a confident result — try a smaller selection or rephrase."]
    )


def verify_selection_edits(
    selection_a1: str,
    rows: list[list[str]],
    edits: list[SelectionEdit],
) -> list[str]:
    """Smoke-test proposed FORMULAS: write the selection at its real coordinates
    into a throwaway workbook, apply the edits, recompute through LibreOffice and
    return any error-token warnings. Best-effort — a missing/failing LibreOffice
    is non-fatal (verification degrades to 'unverified', never blocks the edit).

    KNOWN LIMITATION: the throwaway workbook contains *only* the selection, so a
    proposed formula that references a cell outside it (or another sheet)
    evaluates against blanks — which can both mask a real error and invent a
    spurious one. Treat a clean result here as "the formula parses and computes
    over the selection", not as full verification. The editor's in-browser
    recompute runs against the real workbook and is the stronger check; this is
    the belt-and-braces server-side pass for callers that opt in.
    """
    if not any(e.formula for e in edits):
        return []
    try:
        import tempfile
        from pathlib import Path

        import openpyxl
        from openpyxl.utils.cell import (
            coordinate_to_tuple,
            get_column_letter,
        )

        from litchai.validation.recompute import find_workbook_errors, recompute_workbook

        start = selection_a1.split(":")[0].strip() or "A1"
        start_row, start_col = coordinate_to_tuple(start)

        wb = openpyxl.Workbook()
        ws = wb.active
        for r, row in enumerate(rows):
            for c, val in enumerate(row):
                ws.cell(row=start_row + r, column=start_col + c, value=_coerce(val))
        for e in edits:
            try:
                er, ec = coordinate_to_tuple(e.cell)
            except Exception:
                continue
            cell = ws.cell(row=er, column=ec)
            if e.formula:
                cell.value = e.formula if e.formula.startswith("=") else "=" + e.formula
            elif e.value is not None:
                cell.value = _coerce(e.value)

        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "selection.xlsx"
            wb.save(path)
            grids = recompute_workbook(path)
        errors = find_workbook_errors(grids)
        # find_workbook_errors already reports 1-indexed (row, col) — incrementing
        # again named a cell one row down and one column right of the real error.
        return [
            f"{sheet}!{get_column_letter(col)}{row} would error: {token}"
            for (sheet, row, col, token) in errors
        ]
    except Exception as exc:
        log.info("selection verify skipped: %s", exc)
        return [f"Couldn't auto-verify the formula ({type(exc).__name__}); apply with care."]
