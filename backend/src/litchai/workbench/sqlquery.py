"""``query_sql`` — read-only DuckDB over the workbook's sheets.

Each detected sheet table becomes a DuckDB table (snake_case names, e.g.
``ledger`` with columns ``date, description, amount``) plus a ``_row`` column
holding the real sheet row number, so answers can cite cells.

Safety, in layers:
1. **sqlglot** parses the query: exactly one statement, and it must be a
   SELECT / UNION / WITH tree. Any DDL/DML/COMMAND/PRAGMA/ATTACH node, any
   table that isn't one of ours, and any file/URL table function is refused.
2. DuckDB runs in-memory with ``enable_external_access = false`` and locked
   configuration, so even a missed construct can't read the filesystem.
3. A wall-clock **timeout** interrupts the connection; results are capped.
"""
from __future__ import annotations

import re
import threading
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from litchai.workbench.model import Workbook
from litchai.workbench.tables import detect_tables

MAX_ROWS = 500
DEFAULT_TIMEOUT = 5.0

_FORBIDDEN_FUNCS = {
    "read_csv", "read_csv_auto", "read_parquet", "read_json", "read_json_auto", "read_text",
    "read_blob", "glob", "parquet_scan", "csv_scan", "json_scan", "sniff_csv", "httpfs",
    "read_ndjson", "read_xlsx", "sqlite_scan", "postgres_scan", "mysql_scan", "iceberg_scan",
    "delta_scan", "query", "query_table", "getenv", "current_setting", "duckdb_settings",
    "duckdb_extensions", "load_extension", "install",
}


class SqlRejected(ValueError):
    pass


def ident(name: str) -> str:
    s = re.sub(r"[^0-9a-zA-Z]+", "_", name.strip().lower()).strip("_")
    if not s:
        s = "col"
    if s[0].isdigit():
        s = "c_" + s
    return s


@dataclass
class SqlCatalog:
    tables: dict[str, dict[str, Any]]   # table -> {sheet, columns: {sql_col: letter}}

    def describe(self) -> str:
        lines = []
        for t, info in self.tables.items():
            cols = ", ".join(f"{c} ({letter})" for c, letter in info["columns"].items())
            lines.append(f"{t} [sheet {info['sheet']!r}]: _row, {cols}")
        return "\n".join(lines)


def build_catalog(workbooks: list[Workbook]) -> tuple[SqlCatalog, dict[str, tuple[list[str],
                                                                                 list[list]]]]:
    tables: dict[str, dict[str, Any]] = {}
    data: dict[str, tuple[list[str], list[list]]] = {}
    for wb in workbooks:
        for sheet_name, table in detect_tables(wb).items():
            sheet = wb.sheets[sheet_name]
            tname = ident(sheet_name)
            if tname in tables:
                tname = ident(f"{wb.name}_{sheet_name}")
            n = 2
            while tname in tables:
                tname = f"{tname}_{n}"
                n += 1
            cols: dict[str, str] = {}
            for c in table.columns:
                cname = ident(c.name)
                while cname in cols or cname == "_row":
                    cname += "_"
                cols[cname] = c.letter
            rows = []
            for r in range(table.first_row, table.last_row + 1):
                rows.append([r, *[_sql_value(sheet.value(r, c.index)) for c in table.columns]])
            tables[tname] = {"sheet": sheet_name, "workbook": wb.id, "columns": cols}
            data[tname] = (["_row", *cols.keys()], rows)
    return SqlCatalog(tables), data


def _sql_value(v: Any) -> Any:
    if isinstance(v, datetime):
        return v.date() if v.time() == datetime.min.time() else v
    if isinstance(v, (int, float, date, str)) or v is None:
        return v
    return str(v)


def check_sql(sql: str, allowed_tables: set[str]) -> str:
    import sqlglot
    from sqlglot import exp

    try:
        statements = sqlglot.parse(sql, read="duckdb")
    except sqlglot.errors.ParseError as exc:
        raise SqlRejected(f"could not parse SQL: {str(exc).splitlines()[0]}") from exc
    statements = [s for s in statements if s is not None]
    if len(statements) != 1:
        raise SqlRejected("exactly one SELECT statement is allowed")
    tree = statements[0]
    if not isinstance(tree, (exp.Select, exp.Union, exp.Except, exp.Intersect, exp.Subquery)):
        raise SqlRejected(f"only SELECT queries are allowed (got {tree.key.upper()})")
    banned = (exp.Insert, exp.Update, exp.Delete, exp.Create, exp.Drop, exp.Alter,
              exp.Command, exp.Pragma, exp.Copy, exp.Set, exp.Merge, exp.TruncateTable)
    for node in tree.walk():
        if isinstance(node, banned):
            raise SqlRejected(f"{node.key.upper()} is not allowed")
        if isinstance(node, exp.Func):
            fname = (node.sql_name() if not isinstance(node, exp.Anonymous)
                     else str(node.this)).lower()
            if fname in _FORBIDDEN_FUNCS or fname.startswith("read_"):
                raise SqlRejected(f"function {fname} is not allowed")
    ctes = {c.alias_or_name.lower() for c in tree.find_all(exp.CTE)}
    for t in tree.find_all(exp.Table):
        if isinstance(t.this, exp.Func) or t.args.get("db") or t.args.get("catalog"):
            raise SqlRejected("only the workbook's own tables may be queried")
        name = t.name.lower()
        if name not in allowed_tables and name not in ctes:
            raise SqlRejected(f"unknown table {t.name!r} (tables: {sorted(allowed_tables)})")
        if isinstance(t.this, exp.Literal):
            raise SqlRejected("file paths are not tables")
    return tree.sql(dialect="duckdb")


def query_sql(workbooks: list[Workbook], sql: str, *, timeout: float = DEFAULT_TIMEOUT,
              max_rows: int = MAX_ROWS) -> dict[str, Any]:
    import duckdb

    catalog, data = build_catalog(workbooks)
    checked = check_sql(sql, set(catalog.tables))
    con = duckdb.connect(":memory:")
    try:
        for tname, (cols, rows) in data.items():
            types = [_duck_type([r[i] for r in rows]) for i in range(len(cols))]
            col_sql = ", ".join(f'"{c}" {t}' for c, t in zip(cols, types, strict=True))
            con.execute(f'CREATE TABLE "{tname}" ({col_sql})')
            if rows:
                ph = ", ".join("?" for _ in cols)
                con.executemany(
                    f'INSERT INTO "{tname}" VALUES ({ph})',
                    [[_cast(v, t) for v, t in zip(r, types, strict=True)] for r in rows],
                )
        con.execute("SET enable_external_access = false")
        con.execute("SET lock_configuration = true")

        result: dict[str, Any] = {}
        error: list[BaseException] = []

        def run() -> None:
            try:
                cur = con.execute(checked)
                cols = [d[0] for d in cur.description or []]
                rows = cur.fetchmany(max_rows + 1)
                result["columns"] = cols
                result["rows"] = [[_jsonable(v) for v in row] for row in rows[:max_rows]]
                result["truncated"] = len(rows) > max_rows
            except BaseException as exc:  # noqa: BLE001 — surfaced to the caller below
                error.append(exc)

        th = threading.Thread(target=run, daemon=True)
        th.start()
        th.join(timeout)
        if th.is_alive():
            con.interrupt()
            th.join(1.0)
            raise SqlRejected(f"query exceeded {timeout:.0f}s")
        if error:
            raise SqlRejected(f"query failed: {str(error[0]).splitlines()[0]}")
        result["sql"] = checked
        result["row_count"] = len(result.get("rows", []))
        result["tables"] = catalog.tables
        return result
    finally:
        con.close()


def _duck_type(values: list[Any]) -> str:
    seen = {type(v) for v in values if v is not None}
    if not seen:
        return "VARCHAR"
    if seen <= {int}:
        return "BIGINT"
    if seen <= {int, float}:
        return "DOUBLE"
    if seen <= {date}:
        return "DATE"
    if seen <= {datetime, date}:
        return "TIMESTAMP"
    return "VARCHAR"


def _cast(v: Any, t: str) -> Any:
    if v is None:
        return None
    if t == "VARCHAR":
        return v.isoformat() if isinstance(v, (date, datetime)) else str(v)
    return v


def _jsonable(v: Any) -> Any:
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, float) and v.is_integer():
        return v
    if hasattr(v, "__float__") and not isinstance(v, (int, float)):
        return float(v)
    return v
