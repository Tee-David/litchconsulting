"""A small, safe evaluator for the formulas our tools write.

Used only for *previews* of proposed cells (so the UI and the answer can show a
number before LibreOffice runs). LibreOffice remains the authority: the recompute
gate re-evaluates everything at apply time. Also used to validate formulas a
model drafts (``add_formula_column`` custom templates): anything outside the
function whitelist is refused, so ``INDIRECT``/``WEBSERVICE``/``HYPERLINK``-style
tricks never reach a workbook.

Grammar: numbers, strings, cell refs (``C5``, ``$C$5``, ``Ledger!C5``,
``'Bank Recon'!C5``), ranges, + - * / ^ &, comparisons, parentheses and the
whitelisted functions. Translated to a Python AST and walked node by node — no
``eval``.
"""
from __future__ import annotations

import ast
import re
from collections.abc import Callable
from typing import Any

from litchai.workbench.model import Workbook, parse_a1, parse_range, to_number

ALLOWED_FUNCS = {
    "SUM", "SUMIFS", "SUMIF", "COUNTIFS", "COUNTIF", "COUNT", "COUNTA", "AVERAGE", "MIN",
    "MAX", "ABS", "ROUND", "IF", "AND", "OR", "NOT", "IFERROR", "YEAR", "MONTH", "DAY",
    "TEXT", "LEFT", "RIGHT", "MID", "LEN", "UPPER", "LOWER", "TRIM", "VALUE", "DATE",
    "DATEVALUE", "EOMONTH", "ISBLANK", "ISNUMBER", "MEDIAN",
}

_REF = r"(?:(?:'(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_.]*)!)?\$?[A-Za-z]{1,3}\$?\d+"
_TOKEN = re.compile(
    rf"(?P<str>\"(?:[^\"]|\"\")*\")|(?P<range>{_REF}:\$?[A-Za-z]{{1,3}}\$?\d+)|(?P<ref>{_REF})"
    r"|(?P<func>[A-Za-z][A-Za-z0-9.]*)\s*\(|(?P<num>\d+(?:\.\d+)?)|(?P<op><>|<=|>=|[-+*/^&=<>(),])"
    r"|(?P<ws>\s+)"
)


class FormulaError(ValueError):
    pass


def tokens(formula: str) -> list[tuple[str, str]]:
    src = formula.removeprefix("=")
    out: list[tuple[str, str]] = []
    pos = 0
    while pos < len(src):
        m = _TOKEN.match(src, pos)
        if not m:
            raise FormulaError(f"unexpected text at {src[pos:pos + 12]!r}")
        pos = m.end()
        kind = m.lastgroup
        if kind == "ws":
            continue
        out.append((kind or "", m.group(kind or 0)))
    return out


def functions_used(formula: str) -> set[str]:
    return {v.upper() for k, v in tokens(formula) if k == "func"}


def refs_used(formula: str) -> list[str]:
    return [v for k, v in tokens(formula) if k in ("ref", "range")]


# Functions a person may type in the workbench (E2). Wider than ALLOWED_FUNCS: the
# engine previews its own formulas in Python, but a person's formula is computed by
# LibreOffice in the recompute gate, which reports #NAME? and other errors.
USER_FUNCS = ALLOWED_FUNCS | {
    "AVERAGEIF", "AVERAGEIFS", "MAXIFS", "MINIFS", "SUMPRODUCT", "PRODUCT", "ROUNDUP",
    "ROUNDDOWN", "INT", "MOD", "POWER", "SQRT", "CEILING", "FLOOR", "VLOOKUP", "HLOOKUP",
    "XLOOKUP", "LOOKUP", "INDEX", "MATCH", "XMATCH", "CHOOSE", "IFS", "SWITCH", "IFNA",
    "XOR", "TRUE", "FALSE", "CONCAT", "CONCATENATE", "TEXTJOIN", "SUBSTITUTE", "REPLACE",
    "FIND", "SEARCH", "PROPER", "EXACT", "REPT", "TODAY", "NOW", "EDATE", "NETWORKDAYS",
    "WORKDAY", "DATEDIF", "WEEKDAY", "WEEKNUM", "DAYS", "ISERROR", "ISTEXT", "ISNA",
    "N", "STDEV", "STDEV.S", "VAR", "VAR.S", "LARGE", "SMALL", "RANK", "RANK.EQ",
    "COUNTBLANK", "PMT", "NPV", "IRR", "XNPV", "XIRR", "FV", "PV", "RATE", "NPER",
    "SLN", "DB", "DDB", "UNIQUE", "SORT", "FILTER", "TRANSPOSE", "ROW", "COLUMN",
    "ROWS", "COLUMNS", "OFFSET", "INDIRECT", "ADDRESS",
}


def check_user_formula(formula: str) -> None:
    """A person's formula: it must tokenise, use known spreadsheet functions only, and
    balance its brackets. The value comes from LibreOffice, not from Python."""
    # Only for this check: bare TRUE/FALSE (VLOOKUP's last argument) and a percent sign
    # are normal in Excel but not in the engine's tokenizer. The saved formula is unchanged.
    src = re.sub(r"(?i)\b(TRUE|FALSE)\b(?!\s*\()", "1", formula).replace("%", "")
    toks = tokens(src)
    bad = {v.upper() for k, v in toks if k == "func"} - USER_FUNCS
    if bad:
        raise FormulaError(f"unknown function: {', '.join(sorted(bad))}")
    depth = 0
    for kind, val in toks:
        if kind == "func" or (kind == "op" and val == "("):
            depth += 1
        elif kind == "op" and val == ")":
            depth -= 1
            if depth < 0:
                raise FormulaError("a closing bracket has no opening bracket")
    if depth:
        raise FormulaError("a bracket is not closed")


def check_formula(formula: str) -> None:
    bad = functions_used(formula) - ALLOWED_FUNCS
    if bad:
        raise FormulaError(f"functions not allowed: {', '.join(sorted(bad))}")
    to_python(formula)  # must parse


def to_python(formula: str) -> str:
    parts: list[str] = []
    for kind, val in tokens(formula):
        if kind == "str":
            parts.append(repr(val[1:-1].replace('""', '"')))
        elif kind == "range":
            parts.append(f"_R({val!r})")
        elif kind == "ref":
            parts.append(f"_C({val!r})")
        elif kind == "func":
            name = val.upper().replace(".", "_")
            if val.upper() not in ALLOWED_FUNCS:
                raise FormulaError(f"function {val} not allowed")
            parts.append(f"F_{name}(")
        elif kind == "num":
            parts.append(val)
        else:
            parts.append({"=": "==", "<>": "!=", "^": "**", "&": "@"}.get(val, val))
    code = " ".join(parts)
    try:
        ast.parse(code, mode="eval")
    except SyntaxError as exc:
        raise FormulaError(f"cannot parse formula {formula!r}") from exc
    return code


def _flat(v: Any) -> list[Any]:
    if isinstance(v, list):
        out: list[Any] = []
        for x in v:
            out.extend(_flat(x))
        return out
    return [v]


def _nums(args: tuple) -> list[float]:
    out = []
    for a in args:
        for v in _flat(a):
            n = to_number(v) if not isinstance(v, bool) else None
            if n is not None:
                out.append(n)
    return out


def _crit(value: Any, criterion: Any) -> bool:
    if isinstance(criterion, str):
        m = re.match(r"^(<=|>=|<>|<|>|=)?(.*)$", criterion)
        op, rhs = (m.group(1) or "="), m.group(2) if m else ("=", criterion)
        rn = to_number(rhs)
        if op in ("<", ">", "<=", ">=") or (rn is not None and to_number(value) is not None):
            lv = to_number(value)
            if lv is None or rn is None:
                return op == "<>" and str(value or "") != rhs
            return {"=": lv == rn, "<>": lv != rn, "<": lv < rn, ">": lv > rn,
                    "<=": lv <= rn, ">=": lv >= rn}[op]
        lhs = "" if value is None else str(value).strip().lower()
        same = lhs == rhs.strip().lower()
        return same if op == "=" else not same
    if criterion is None:
        return value is None
    lv = to_number(value)
    return lv is not None and lv == to_number(criterion)


def _sumifs(sum_range: Any, *pairs: Any) -> float:
    vals = _flat(sum_range)
    keep = [True] * len(vals)
    for i in range(0, len(pairs) - 1, 2):
        rng, crit = _flat(pairs[i]), pairs[i + 1]
        for j in range(len(vals)):
            if j >= len(rng) or not _crit(rng[j], crit):
                keep[j] = False
    return sum(to_number(v) or 0.0 for v, k in zip(vals, keep, strict=True) if k)


def _countifs(*pairs: Any) -> int:
    first = _flat(pairs[0]) if pairs else []
    keep = [True] * len(first)
    for i in range(0, len(pairs) - 1, 2):
        rng, crit = _flat(pairs[i]), pairs[i + 1]
        for j in range(len(keep)):
            if j >= len(rng) or not _crit(rng[j], crit):
                keep[j] = False
    return sum(keep)


def _round(x: Any, n: Any = 0) -> float:
    return round(to_number(x) or 0.0, int(to_number(n) or 0))


def _if(cond: Any, a: Any = True, b: Any = False) -> Any:
    return a if cond else b


def _iferror(a: Any, b: Any) -> Any:
    return b if isinstance(a, FormulaError) else a


FUNCS: dict[str, Callable[..., Any]] = {
    "F_SUM": lambda *a: sum(_nums(a)),
    "F_SUMIFS": _sumifs,
    "F_SUMIF": lambda rng, crit, sr=None: _sumifs(sr if sr is not None else rng, rng, crit),
    "F_COUNTIFS": _countifs,
    "F_COUNTIF": lambda rng, crit: _countifs(rng, crit),
    "F_COUNT": lambda *a: len(_nums(a)),
    "F_COUNTA": lambda *a: sum(1 for v in _flat(list(a)) if v not in (None, "")),
    "F_AVERAGE": lambda *a: (sum(_nums(a)) / len(_nums(a))) if _nums(a) else 0.0,
    "F_MEDIAN": lambda *a: sorted(_nums(a))[len(_nums(a)) // 2] if _nums(a) else 0.0,
    "F_MIN": lambda *a: min(_nums(a)) if _nums(a) else 0.0,
    "F_MAX": lambda *a: max(_nums(a)) if _nums(a) else 0.0,
    "F_ABS": lambda x: abs(to_number(x) or 0.0),
    "F_ROUND": _round,
    "F_IF": _if,
    "F_AND": lambda *a: all(_flat(list(a))),
    "F_OR": lambda *a: any(_flat(list(a))),
    "F_NOT": lambda x: not x,
    "F_IFERROR": _iferror,
    "F_LEN": lambda s: len(str(s or "")),
    "F_UPPER": lambda s: str(s or "").upper(),
    "F_LOWER": lambda s: str(s or "").lower(),
    "F_TRIM": lambda s: " ".join(str(s or "").split()),
    "F_VALUE": lambda s: to_number(s) or 0.0,
    "F_ISBLANK": lambda v: v in (None, ""),
    "F_ISNUMBER": lambda v: to_number(v) is not None and not isinstance(v, str),
    "F_LEFT": lambda s, n=1: str(s or "")[: int(to_number(n) or 1)],
    "F_RIGHT": lambda s, n=1: str(s or "")[-int(to_number(n) or 1):],
    "F_MID": lambda s, a, n: str(s or "")[int(to_number(a) or 1) - 1:][: int(to_number(n) or 0)],
    "F_YEAR": lambda d: getattr(d, "year", None),
    "F_MONTH": lambda d: getattr(d, "month", None),
    "F_DAY": lambda d: getattr(d, "day", None),
}


class Evaluator:
    """Evaluates formulas against a workbook model; a referenced formula cell
    without a value is evaluated recursively (depth-guarded)."""

    def __init__(self, model: Workbook, max_depth: int = 40) -> None:
        self.model = model
        self.max_depth = max_depth
        self._depth = 0
        self._cache: dict[tuple[str, int, int], Any] = {}

    def _sheet_of(self, ref: str, default: str) -> tuple[str, str]:
        if "!" in ref:
            s, _, cell = ref.rpartition("!")
            if s.startswith("'"):
                s = s[1:-1].replace("''", "'")
            return s, cell
        return default, ref

    def cell(self, sheet_name: str, row: int, col: int) -> Any:
        key = (sheet_name, row, col)
        if key in self._cache:
            return self._cache[key]
        sheet = self.model.sheet(sheet_name)
        c = sheet.get(row, col)
        if c is None:
            return None
        if c.formula and c.value is None:
            if c.preview is not None:
                return c.preview
            if self._depth >= self.max_depth:
                raise FormulaError("formula nesting too deep")
            self._depth += 1
            try:
                v = self.evaluate(c.formula, sheet_name)
            finally:
                self._depth -= 1
            self._cache[key] = v
            return v
        return c.value

    def evaluate(self, formula: str, sheet_name: str) -> Any:
        code = to_python(formula)
        tree = ast.parse(code, mode="eval")

        def c_(ref: str) -> Any:
            s, cell = self._sheet_of(ref, sheet_name)
            r, col = parse_a1(cell)
            return self.cell(s, r, col)

        def r_(ref: str) -> list[Any]:
            s, rng = self._sheet_of(ref, sheet_name)
            r0, c0, r1, c1 = parse_range(rng)
            return [self.cell(s, r, c) for r in range(r0, r1 + 1) for c in range(c0, c1 + 1)]

        env: dict[str, Any] = {"_C": c_, "_R": r_, **FUNCS}
        return _walk(tree.body, env)


def _num(v: Any) -> float:
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    n = to_number(v)
    return 0.0 if n is None else n


def _walk(node: ast.AST, env: dict[str, Any]) -> Any:
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        fn = env.get(node.func.id)
        if fn is None:
            raise FormulaError(f"unknown function {node.func.id}")
        args = [_walk(a, env) for a in node.args]
        return fn(*args)
    if isinstance(node, ast.UnaryOp):
        v = _walk(node.operand, env)
        if isinstance(node.op, ast.USub):
            return -_num(v)
        if isinstance(node.op, ast.UAdd):
            return _num(v)
        raise FormulaError("unsupported unary operator")
    if isinstance(node, ast.BinOp):
        a, b = _walk(node.left, env), _walk(node.right, env)
        if isinstance(node.op, ast.MatMult):
            return f"{'' if a is None else a}{'' if b is None else b}"
        x, y = _num(a), _num(b)
        if isinstance(node.op, ast.Add):
            return x + y
        if isinstance(node.op, ast.Sub):
            return x - y
        if isinstance(node.op, ast.Mult):
            return x * y
        if isinstance(node.op, ast.Div):
            if y == 0:
                raise FormulaError("#DIV/0!")
            return x / y
        if isinstance(node.op, ast.Pow):
            return x ** y
        raise FormulaError("unsupported operator")
    if isinstance(node, ast.Compare) and len(node.ops) == 1:
        a, b = _walk(node.left, env), _walk(node.comparators[0], env)
        op = node.ops[0]
        if isinstance(op, (ast.Eq, ast.NotEq)) and (isinstance(a, str) or isinstance(b, str)):
            same = str(a or "").lower() == str(b or "").lower()
            return same if isinstance(op, ast.Eq) else not same
        x, y = _num(a), _num(b)
        return {ast.Eq: x == y, ast.NotEq: x != y, ast.Lt: x < y, ast.Gt: x > y,
                ast.LtE: x <= y, ast.GtE: x >= y}[type(op)]
    raise FormulaError(f"unsupported expression {type(node).__name__}")


def safe_preview(model: Workbook, sheet: str, formula: str) -> Any:
    try:
        v = Evaluator(model).evaluate(formula, sheet)
    except Exception:  # noqa: BLE001 — a preview is best-effort; the gate is the authority
        return None
    if isinstance(v, float):
        return round(v, 2)
    return v
