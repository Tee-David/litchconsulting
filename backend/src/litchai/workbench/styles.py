"""S5: cell formatting in the workbench.

A style is a small dict, the same on the wire, in operations and in the model:

    b, i, u      bold, italic, underline            (bool)
    fc, bg       text colour, fill colour            ("RRGGBB" or None)
    ha           horizontal alignment                ("left" | "center" | "right" | None)
    wrap         wrap text                           (bool)
    bt, bb, bl, br  thin border on top/bottom/left/right (bool)

An edit carries only the keys it changes. ``old_style`` on an operation is the full
style before it, so undo puts every key back.
"""
from __future__ import annotations

import re
from typing import Any

STYLE_KEYS = ("b", "i", "u", "fc", "bg", "ha", "wrap", "bt", "bb", "bl", "br")
_HEX = re.compile(r"^[0-9A-Fa-f]{6}$")
DEFAULT: dict[str, Any] = {"b": False, "i": False, "u": False, "fc": None, "bg": None, "ha": None,
                           "wrap": False, "bt": False, "bb": False, "bl": False, "br": False}


class StyleError(ValueError):
    pass


# Names models often use for the same keys.
ALIASES = {
    "bold": "b", "italic": "i", "underline": "u",
    "fill": "bg", "background": "bg", "bg_color": "bg", "fill_color": "bg", "background_color": "bg",
    "color": "fc", "font_color": "fc", "text_color": "fc",
    "align": "ha", "alignment": "ha", "horizontal": "ha", "horizontal_alignment": "ha",
    "wrap_text": "wrap",
    "border_top": "bt", "top_border": "bt", "border_bottom": "bb", "bottom_border": "bb",
    "border_left": "bl", "left_border": "bl", "border_right": "br", "right_border": "br",
}


def clean(style: dict[str, Any] | None) -> dict[str, Any] | None:
    """Validate a partial style from a person or a model. Unknown keys are refused."""
    if style is None:
        return None
    if not isinstance(style, dict):
        raise StyleError("a style must be an object")
    raw = dict(style)
    border = raw.pop("border", raw.pop("borders", None))
    if border is not None:
        sides = {"all": ("bt", "bb", "bl", "br"), "outline": ("bt", "bb", "bl", "br"), "box": ("bt", "bb", "bl", "br"),
                 "top": ("bt",), "bottom": ("bb",), "left": ("bl",), "right": ("br",), "none": ()}
        key = "all" if border is True else ("none" if border is False else str(border).lower())
        if key not in sides:
            raise StyleError("border must be all, top, bottom, left, right or none")
        for s in ("bt", "bb", "bl", "br"):
            raw[s] = s in sides[key]
    style = {ALIASES.get(k, k): v for k, v in raw.items()}
    if style.get("ha") == "centre":
        style["ha"] = "center"
    out: dict[str, Any] = {}
    for k, v in style.items():
        if k not in STYLE_KEYS:
            raise StyleError(f"unknown style key {k!r}")
        if k in ("fc", "bg"):
            if v in (None, ""):
                out[k] = None
            elif isinstance(v, str) and _HEX.match(v.lstrip("#")):
                out[k] = v.lstrip("#").upper()
            else:
                raise StyleError(f"{k} must be a colour like 1F3A8A")
        elif k == "ha":
            if v not in (None, "left", "center", "right"):
                raise StyleError("ha must be left, center or right")
            out[k] = v
        else:
            out[k] = bool(v)
    return out


def _rgb(color: Any) -> str | None:
    rgb = getattr(color, "rgb", None)
    if isinstance(rgb, str) and len(rgb) >= 6 and rgb[-6:] != "000000" and getattr(color, "type", "rgb") == "rgb":
        return rgb[-6:].upper()
    return None


def read_style(cell: Any) -> dict[str, Any] | None:
    """The style of an openpyxl cell, or None when it has none of ours."""
    st: dict[str, Any] = {}
    f = cell.font
    if f is not None:
        if f.b:
            st["b"] = True
        if f.i:
            st["i"] = True
        if f.u:
            st["u"] = True
        fc = _rgb(f.color) if f.color is not None else None
        if fc:
            st["fc"] = fc
    fill = cell.fill
    if fill is not None and fill.fill_type == "solid":
        bg = _rgb(fill.fgColor)
        if bg and bg != "FFFFFF":
            st["bg"] = bg
    al = cell.alignment
    if al is not None:
        if al.horizontal in ("left", "center", "right"):
            st["ha"] = al.horizontal
        if al.wrap_text:
            st["wrap"] = True
    bd = cell.border
    if bd is not None:
        for key, side in (("bt", bd.top), ("bb", bd.bottom), ("bl", bd.left), ("br", bd.right)):
            if side is not None and side.style:
                st[key] = True
    return st or None


def full(style: dict[str, Any] | None) -> dict[str, Any]:
    out = dict(DEFAULT)
    out.update(style or {})
    return out


def apply_style(cell: Any, style: dict[str, Any]) -> None:
    """Set the keys in ``style`` on an openpyxl cell; other formatting stays."""
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

    if not style:
        return
    if any(k in style for k in ("b", "i", "u", "fc")):
        f = cell.font
        kw = {"name": f.name, "size": f.sz, "b": f.b, "i": f.i, "u": f.u, "color": f.color}
        if "b" in style:
            kw["b"] = style["b"]
        if "i" in style:
            kw["i"] = style["i"]
        if "u" in style:
            kw["u"] = "single" if style["u"] else None
        if "fc" in style:
            kw["color"] = ("FF" + style["fc"]) if style["fc"] else None
        cell.font = Font(**kw)
    if "bg" in style:
        cell.fill = PatternFill("solid", fgColor="FF" + style["bg"]) if style["bg"] else PatternFill(fill_type=None)
    if "ha" in style or "wrap" in style:
        a = cell.alignment
        cell.alignment = Alignment(
            horizontal=style.get("ha", a.horizontal) if "ha" in style else a.horizontal,
            vertical=a.vertical, wrap_text=style["wrap"] if "wrap" in style else a.wrap_text)
    if any(k in style for k in ("bt", "bb", "bl", "br")):
        b = cell.border
        thin = Side(style="thin", color="FF8A93A8")

        def side(key: str, cur: Any) -> Any:
            if key not in style:
                return cur
            return thin if style[key] else Side()

        cell.border = Border(top=side("bt", b.top), bottom=side("bb", b.bottom),
                             left=side("bl", b.left), right=side("br", b.right))
