"""Conditional formatting (E3 part 2): rules on a range that colour a cell by its value.

A rule is ``{"when": equal|not_equal|greater|less|between|contains, "value": x,
"value2": y (between only), "bg": "C6EFCE", "fc": "006100", "b": true}``. The same
rules are written into the xlsx (openpyxl CellIsRule / containsText rule, so Excel
shows them) and evaluated here for the grid (``style_for``), so the page shows the
colours without its own rule engine.
"""
from __future__ import annotations

import re
from typing import Any

from litchai.workbench.model import parse_a1

WHEN = ("equal", "not_equal", "greater", "less", "between", "contains")
_HEX = re.compile(r"^[0-9A-Fa-f]{6}$")
_RANGE = re.compile(r"^\$?[A-Z]{1,3}\$?\d{1,7}(:\$?[A-Z]{1,3}\$?\d{1,7})?$")
# Excel's own "good" and "bad" styles.
PASS_RULE = {"when": "equal", "value": "PASS", "bg": "C6EFCE", "fc": "006100", "b": True}
FAIL_RULE = {"when": "equal", "value": "FAIL", "bg": "FFC7CE", "fc": "9C0006", "b": True}


class CondFormatError(ValueError):
    pass


def clean_rules(rng: str, rules: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    rng = (rng or "").replace("$", "").upper().strip()
    if not _RANGE.match(rng):
        raise CondFormatError(f"range {rng!r} must look like B5:B20")
    if not rules or len(rules) > 10:
        raise CondFormatError("give 1 to 10 rules")
    out = []
    for r in rules:
        when = str(r.get("when", "")).lower().replace(" ", "_")
        when = {"equals": "equal", "eq": "equal", "=": "equal", "gt": "greater", ">": "greater",
                "greater_than": "greater", "lt": "less", "<": "less", "less_than": "less",
                "not_equals": "not_equal", "!=": "not_equal"}.get(when, when)
        if when not in WHEN:
            raise CondFormatError(f"when must be one of {WHEN}")
        if "value" not in r:
            raise CondFormatError("each rule needs a value")
        rule: dict[str, Any] = {"when": when, "value": r["value"]}
        if when == "between":
            if "value2" not in r:
                raise CondFormatError("between needs value2")
            rule["value2"] = r["value2"]
        for k in ("bg", "fc"):
            v = str(r.get(k) or "").lstrip("#")
            if v:
                if not _HEX.match(v):
                    raise CondFormatError(f"{k} must be a colour like C6EFCE")
                rule[k] = v.upper()
        if r.get("b"):
            rule["b"] = True
        if not any(k in rule for k in ("bg", "fc", "b")):
            raise CondFormatError("each rule needs bg, fc or b")
        out.append(rule)
    return rng, out


def _bounds(rng: str) -> tuple[int, int, int, int]:
    a, _, b = rng.partition(":")
    r0, c0 = parse_a1(a)
    r1, c1 = parse_a1(b or a)
    return min(r0, r1), min(c0, c1), max(r0, r1), max(c0, c1)


def _num(v: Any) -> float | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def matches(rule: dict[str, Any], value: Any) -> bool:
    when, want = rule["when"], rule["value"]
    if value is None or value == "":
        return False
    if when == "contains":
        return str(want).lower() in str(value).lower()
    a, b = _num(value), _num(want)
    if when in ("equal", "not_equal"):
        same = (a == b) if (a is not None and b is not None) else (
            str(value).strip().lower() == str(want).strip().lower())
        return same if when == "equal" else not same
    if a is None or b is None:
        return False
    if when == "greater":
        return a > b
    if when == "less":
        return a < b
    c = _num(rule.get("value2"))
    return c is not None and min(b, c) <= a <= max(b, c)


def style_for(cond_formats: list[dict[str, Any]], r: int, c: int, value: Any) -> dict[str, Any] | None:
    """The style of the first matching rule over this cell (as in Excel's stop order)."""
    for cf in cond_formats:
        r0, c0, r1, c1 = _bounds(cf["range"])
        if not (r0 <= r <= r1 and c0 <= c <= c1):
            continue
        for rule in cf["rules"]:
            if matches(rule, value):
                return {k: rule[k] for k in ("bg", "fc", "b") if k in rule}
    return None


def _xl(v: Any) -> str:
    """A rule value as an Excel formula: numbers bare, text quoted."""
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return repr(v)
    return '"' + str(v).replace('"', '""') + '"'


def write_rules(ws: Any, rng: str, rules: list[dict[str, Any]]) -> None:
    from openpyxl.formatting.rule import CellIsRule, Rule
    from openpyxl.styles import Font, PatternFill
    from openpyxl.styles.differential import DifferentialStyle

    for rule in rules:
        fill = PatternFill(start_color=rule["bg"], end_color=rule["bg"], fill_type="solid") \
            if rule.get("bg") else None
        font = Font(color=rule.get("fc"), bold=bool(rule.get("b"))) \
            if rule.get("fc") or rule.get("b") else None
        if rule["when"] == "contains":
            first = rng.split(":")[0]
            text = str(rule["value"]).replace('"', '""')
            xr = Rule(type="containsText", operator="containsText", text=str(rule["value"]),
                      dxf=DifferentialStyle(fill=fill, font=font))
            xr.formula = [f'NOT(ISERROR(SEARCH("{text}",{first})))']
            ws.conditional_formatting.add(rng, xr)
            continue
        op = {"equal": "equal", "not_equal": "notEqual", "greater": "greaterThan",
              "less": "lessThan", "between": "between"}[rule["when"]]
        formula = [_xl(rule["value"])] + ([_xl(rule["value2"])] if rule["when"] == "between" else [])
        kw: dict[str, Any] = {"operator": op, "formula": formula}
        if fill is not None:
            kw["fill"] = fill
        if font is not None:
            kw["font"] = font
        ws.conditional_formatting.add(rng, CellIsRule(**kw))


def clear_rules(ws: Any, rng: str) -> None:
    from openpyxl.formatting.formatting import ConditionalFormattingList

    keep = ConditionalFormattingList()
    for cf in ws.conditional_formatting:
        if str(cf.sqref).replace("$", "").upper() == rng:
            continue
        for rule in cf.rules:
            keep.add(str(cf.sqref), rule)
    ws.conditional_formatting = keep


def read_rules(ws: Any) -> list[dict[str, Any]]:
    """Rules this module can show, read back from an xlsx (others are kept in the
    file by openpyxl but not drawn)."""
    back = {"equal": "equal", "notEqual": "not_equal", "greaterThan": "greater",
            "lessThan": "less", "between": "between"}
    out: list[dict[str, Any]] = []
    try:
        for cf in ws.conditional_formatting:
            rules = []
            for xr in cf.rules:
                dxf = xr.dxf
                st: dict[str, Any] = {}
                try:
                    bg = dxf.fill.fgColor.rgb if dxf and dxf.fill is not None else None
                    if isinstance(bg, str) and len(bg) >= 6:
                        st["bg"] = bg[-6:].upper()
                    fc = dxf.font.color.rgb if dxf and dxf.font is not None and dxf.font.color else None
                    if isinstance(fc, str) and len(fc) >= 6:
                        st["fc"] = fc[-6:].upper()
                    if dxf and dxf.font is not None and dxf.font.b:
                        st["b"] = True
                except AttributeError:
                    pass
                if not st:
                    continue
                if xr.type == "cellIs" and xr.operator in back and xr.formula:
                    def val(f: str) -> Any:
                        f = str(f)
                        return f[1:-1].replace('""', '"') if f.startswith('"') else (_num(f) if _num(f) is not None else f)
                    rule = {"when": back[xr.operator], "value": val(xr.formula[0]), **st}
                    if xr.operator == "between" and len(xr.formula) > 1:
                        rule["value2"] = val(xr.formula[1])
                    rules.append(rule)
                elif xr.type == "containsText" and xr.text:
                    rules.append({"when": "contains", "value": xr.text, **st})
            if rules:
                for part in str(cf.sqref).replace("$", "").upper().split():
                    out.append({"range": part, "rules": rules})
    except Exception:  # noqa: BLE001 — display only; the file keeps its rules either way
        return out
    return out[:200]
