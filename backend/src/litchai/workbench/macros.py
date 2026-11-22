"""Macros in a workbook (v8, limit 2.3): read and explain them, never run them.

A macro is a program. Running one on the server could do anything, so Sage never
runs it. When an .xlsm or .xls file arrives, the VBA code is read with oletools and
kept with the file: each module (name, lines, the first part of the code) and the
warnings oletools finds (runs by itself when the file opens, can start programs,
download files or write to disk). The read_macros step gives Sage the code to explain
in plain words and to rebuild with formulas or Sage steps when asked.
"""
from __future__ import annotations

from typing import Any

MAX_CODE = 8000       # characters kept per module
MAX_TOTAL = 30000     # characters kept per file

# oletools warning types and plain words for them
_KIND_WORDS = {
    "AutoExec": "runs by itself when the file opens",
    "Suspicious": "does something risky",
    "IOC": "contains a web address, file path or program name",
    "Hex String": "hides text as hex",
    "Base64 String": "hides text as Base64",
    "Dridex String": "hides text with a known malware trick",
    "VBA string": "builds hidden text",
}


def read_vba(data: bytes, filename: str) -> dict[str, Any] | None:
    """{"modules": [{name, lines, code}], "warnings": [{kind, keyword, what}], "risky": bool}
    or None when the file has no macros (or oletools is not installed)."""
    try:
        from oletools.olevba import VBA_Parser
    except ImportError:  # pragma: no cover - the VM and CI install it
        return None
    try:
        vp = VBA_Parser(filename, data=data)
    except Exception:  # noqa: BLE001 - an unreadable container has no macros we can show
        return None
    try:
        if not vp.detect_vba_macros():
            return None
        modules: list[dict[str, Any]] = []
        total = 0
        for _f, _stream, name, code in vp.extract_macros():
            text = (code or "").replace("\r\n", "\n")
            if not text.strip() or name in {m["name"] for m in modules}:
                continue
            keep = text[: max(0, min(MAX_CODE, MAX_TOTAL - total))]
            total += len(keep)
            modules.append({"name": str(name), "lines": text.count("\n") + 1, "code": keep,
                            "truncated": len(keep) < len(text)})
        warnings = []
        for kind, keyword, description in vp.analyze_macros() or []:
            warnings.append({"kind": kind, "keyword": str(keyword)[:80],
                             "what": _KIND_WORDS.get(kind, kind.lower()),
                             "detail": str(description)[:160]})
        risky = any(w["kind"] in ("Suspicious", "Dridex String") for w in warnings)
        return {"modules": modules, "warnings": warnings[:30], "risky": risky}
    finally:
        vp.close()


def summary_line(macros: dict[str, Any]) -> str:
    """One plain sentence for the overview and the file list."""
    n = len(macros.get("modules") or [])
    lines = sum(m.get("lines", 0) for m in macros.get("modules") or [])
    auto = any(w["kind"] == "AutoExec" for w in macros.get("warnings") or [])
    out = (f"This file has macros ({n} module{'s' if n != 1 else ''}, {lines} lines). Sage reads "
           "them but never runs them.")
    if macros.get("risky"):
        risky = sorted({w["keyword"] for w in macros["warnings"] if w["kind"] == "Suspicious"})[:4]
        out += f" Warning: the code can do risky things ({', '.join(risky)}). Do not run it in Excel until it is checked."
    elif auto:
        out += " It runs by itself when the file is opened in Excel."
    return out


def read_macros_tool(ctx: Any, conv_refs: list[Any], workbook_id: str | None = None) -> Any:
    from litchai.workbench.context import ToolError, ToolOutput

    refs = [r for r in conv_refs if (r.source or {}).get("macros")
            and (workbook_id is None or r.id == workbook_id)]
    if not refs:
        raise ToolError("no file in this job has macros")
    parts: list[str] = []
    data: list[dict[str, Any]] = []
    for r in refs:
        m = r.source["macros"]
        parts.append(f"{r.name}: {summary_line(m)}")
        for mod in m.get("modules", []):
            parts.append(f"--- module {mod['name']} ({mod['lines']} lines)"
                         f"{', shortened' if mod.get('truncated') else ''} ---\n{mod['code']}")
        for w in m.get("warnings", [])[:10]:
            parts.append(f"warning: {w['keyword']}: {w['what']}")
        data.append({"file": r.name, "workbook_id": r.id, **m})
    return ToolOutput(data={"files": data},
                      summary="\n".join(parts)[:20000] + "\n(Read only: the macros were not run.)")
