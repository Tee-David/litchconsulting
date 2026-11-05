"""Chart proposals (``add_chart``): one spec, two renderings.

The spec references real ranges, so the inserted openpyxl chart is a native
Excel chart *linked to its cells* (the client can edit it and it updates with
the numbers). The same spec yields a JSON ``preview`` — labels + series values
read from the model, pending proposals included — that the workbench draws in
the side panel before anything is inserted.

Spec::

    {"type": "column"|"bar"|"stacked"|"line"|"area"|"pie", "title": str,
     "sheet": "P&L", "anchor": "F3",
     "categories": "'P&L'!A2:A13",
     "series": [{"name": "Revenue", "ref": "'P&L'!B2:B13"}, ...],
     "y_format": "money"|"number"|"percent"}
"""
from __future__ import annotations

from typing import Any

from litchai.workbench.model import Workbook, parse_range, qualify, split_qualified, to_number

CHART_TYPES = ("column", "bar", "stacked", "line", "area", "pie")


class ChartError(ValueError):
    pass


def _cells(model: Workbook, ref: str, default_sheet: str) -> list[Any]:
    sheet_name, rng = split_qualified(ref)
    sheet = model.sheet(sheet_name or default_sheet)
    r0, c0, r1, c1 = parse_range(rng)
    out = []
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            out.append(sheet.value(r, c))
    return out


def validate_spec(model: Workbook, spec: dict[str, Any]) -> dict[str, Any]:
    t = spec.get("type", "column")
    if t not in CHART_TYPES:
        raise ChartError(f"chart type must be one of {CHART_TYPES}")
    series = spec.get("series") or []
    if not series:
        raise ChartError("a chart needs at least one series")
    if not spec.get("categories"):
        raise ChartError("a chart needs a categories range")
    sheet = spec.get("sheet") or split_qualified(series[0]["ref"])[0] or next(iter(model.sheets))
    clean = {
        "type": t, "title": (spec.get("title") or "Chart")[:80], "sheet": sheet,
        "anchor": spec.get("anchor") or "H2",
        "categories": _qualified(spec["categories"], sheet),
        "series": [{"name": (s.get("name") or f"Series {i + 1}")[:60],
                    "ref": _qualified(s["ref"], sheet)} for i, s in enumerate(series)],
        "y_format": spec.get("y_format") or "money",
    }
    n = len(_cells(model, clean["categories"], sheet))
    for s in clean["series"]:
        if len(_cells(model, s["ref"], sheet)) != n:
            raise ChartError(f"series {s['name']!r} length doesn't match the categories")
    return clean


def _qualified(ref: str, sheet: str) -> str:
    s, rng = split_qualified(ref)
    return qualify(s or sheet, rng.replace("$", ""))


def preview(model: Workbook, spec: dict[str, Any]) -> dict[str, Any]:
    """JSON the UI renders (Recharts-friendly: one object per category)."""
    spec = validate_spec(model, spec)
    labels = [str(v) if v is not None else "" for v in _cells(model, spec["categories"],
                                                               spec["sheet"])]
    series = []
    for s in spec["series"]:
        vals = [to_number(v) for v in _cells(model, s["ref"], spec["sheet"])]
        series.append({"name": s["name"], "ref": s["ref"],
                       "data": [round(v, 2) if v is not None else None for v in vals]})
    rows = []
    for i, label in enumerate(labels):
        row: dict[str, Any] = {"label": label}
        for s in series:
            row[s["name"]] = s["data"][i]
        rows.append(row)
    return {"spec": spec, "labels": labels, "series": series, "rows": rows,
            "format": spec["y_format"]}


def insert_chart(ws: Any, spec: dict[str, Any]) -> None:
    from openpyxl.chart import AreaChart, BarChart, LineChart, PieChart, Reference

    def ref(qualified: str) -> Reference:
        sheet_name, rng = split_qualified(qualified)
        target = ws.parent[sheet_name] if sheet_name else ws
        r0, c0, r1, c1 = parse_range(rng)
        return Reference(target, min_col=c0, min_row=r0, max_col=c1, max_row=r1)

    t = spec.get("type", "column")
    if t in ("column", "bar", "stacked"):
        chart = BarChart()
        chart.type = "bar" if t == "bar" else "col"
        if t == "stacked":
            chart.grouping = "stacked"
            chart.overlap = 100
    elif t == "line":
        chart = LineChart()
    elif t == "area":
        chart = AreaChart()
    else:
        chart = PieChart()
    chart.title = spec.get("title") or "Chart"
    from openpyxl.chart import Series

    for s in spec.get("series", []):
        series = Series(ref(s["ref"]), title=s.get("name"))
        chart.series.append(series)
    chart.set_categories(ref(spec["categories"]))
    chart.width, chart.height = 18, 9
    ws.add_chart(chart, spec.get("anchor") or "H2")
