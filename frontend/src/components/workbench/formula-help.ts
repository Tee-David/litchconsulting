/**
 * Function help for typing formulas in the workbench (E2). The list matches the
 * engine's USER_FUNCS (backend/src/litchai/workbench/formula.py); the engine is
 * the authority and refuses anything else.
 */
export const FUNCS: Record<string, string> = {
  SUM: "SUM(number1, [number2], …)",
  SUMIF: "SUMIF(range, criteria, [sum_range])",
  SUMIFS: "SUMIFS(sum_range, criteria_range1, criteria1, …)",
  SUMPRODUCT: "SUMPRODUCT(array1, [array2], …)",
  AVERAGE: "AVERAGE(number1, [number2], …)",
  AVERAGEIF: "AVERAGEIF(range, criteria, [average_range])",
  AVERAGEIFS: "AVERAGEIFS(average_range, criteria_range1, criteria1, …)",
  COUNT: "COUNT(value1, [value2], …)",
  COUNTA: "COUNTA(value1, [value2], …)",
  COUNTBLANK: "COUNTBLANK(range)",
  COUNTIF: "COUNTIF(range, criteria)",
  COUNTIFS: "COUNTIFS(criteria_range1, criteria1, …)",
  MIN: "MIN(number1, [number2], …)",
  MAX: "MAX(number1, [number2], …)",
  MINIFS: "MINIFS(min_range, criteria_range1, criteria1, …)",
  MAXIFS: "MAXIFS(max_range, criteria_range1, criteria1, …)",
  MEDIAN: "MEDIAN(number1, [number2], …)",
  ROUND: "ROUND(number, num_digits)",
  ROUNDUP: "ROUNDUP(number, num_digits)",
  ROUNDDOWN: "ROUNDDOWN(number, num_digits)",
  ABS: "ABS(number)",
  INT: "INT(number)",
  MOD: "MOD(number, divisor)",
  POWER: "POWER(number, power)",
  SQRT: "SQRT(number)",
  PRODUCT: "PRODUCT(number1, [number2], …)",
  IF: "IF(logical_test, value_if_true, [value_if_false])",
  IFS: "IFS(test1, value1, [test2, value2], …)",
  IFERROR: "IFERROR(value, value_if_error)",
  IFNA: "IFNA(value, value_if_na)",
  AND: "AND(logical1, [logical2], …)",
  OR: "OR(logical1, [logical2], …)",
  NOT: "NOT(logical)",
  SWITCH: "SWITCH(expression, value1, result1, …, [default])",
  VLOOKUP: "VLOOKUP(lookup_value, table_array, col_index, [range_lookup])",
  HLOOKUP: "HLOOKUP(lookup_value, table_array, row_index, [range_lookup])",
  XLOOKUP: "XLOOKUP(lookup_value, lookup_array, return_array, [if_not_found])",
  INDEX: "INDEX(array, row_num, [column_num])",
  MATCH: "MATCH(lookup_value, lookup_array, [match_type])",
  XMATCH: "XMATCH(lookup_value, lookup_array, [match_mode])",
  CHOOSE: "CHOOSE(index_num, value1, [value2], …)",
  TEXT: "TEXT(value, format_text)",
  CONCAT: "CONCAT(text1, [text2], …)",
  TEXTJOIN: "TEXTJOIN(delimiter, ignore_empty, text1, …)",
  LEFT: "LEFT(text, [num_chars])",
  RIGHT: "RIGHT(text, [num_chars])",
  MID: "MID(text, start_num, num_chars)",
  LEN: "LEN(text)",
  TRIM: "TRIM(text)",
  UPPER: "UPPER(text)",
  LOWER: "LOWER(text)",
  PROPER: "PROPER(text)",
  SUBSTITUTE: "SUBSTITUTE(text, old_text, new_text, [instance])",
  FIND: "FIND(find_text, within_text, [start_num])",
  SEARCH: "SEARCH(find_text, within_text, [start_num])",
  VALUE: "VALUE(text)",
  DATE: "DATE(year, month, day)",
  DATEVALUE: "DATEVALUE(date_text)",
  TODAY: "TODAY()",
  NOW: "NOW()",
  YEAR: "YEAR(date)",
  MONTH: "MONTH(date)",
  DAY: "DAY(date)",
  EOMONTH: "EOMONTH(start_date, months)",
  EDATE: "EDATE(start_date, months)",
  NETWORKDAYS: "NETWORKDAYS(start_date, end_date, [holidays])",
  WORKDAY: "WORKDAY(start_date, days, [holidays])",
  DATEDIF: "DATEDIF(start_date, end_date, unit)",
  WEEKDAY: "WEEKDAY(date, [return_type])",
  DAYS: "DAYS(end_date, start_date)",
  ISBLANK: "ISBLANK(value)",
  ISNUMBER: "ISNUMBER(value)",
  ISTEXT: "ISTEXT(value)",
  ISERROR: "ISERROR(value)",
  PMT: "PMT(rate, nper, pv, [fv], [type])",
  NPV: "NPV(rate, value1, [value2], …)",
  IRR: "IRR(values, [guess])",
  XNPV: "XNPV(rate, values, dates)",
  XIRR: "XIRR(values, dates, [guess])",
  FV: "FV(rate, nper, pmt, [pv], [type])",
  PV: "PV(rate, nper, pmt, [fv], [type])",
  SLN: "SLN(cost, salvage, life)",
  LARGE: "LARGE(array, k)",
  SMALL: "SMALL(array, k)",
  RANK: "RANK(number, ref, [order])",
  UNIQUE: "UNIQUE(array)",
  SORT: "SORT(array, [sort_index], [sort_order])",
  FILTER: "FILTER(array, include, [if_empty])",
  TRANSPOSE: "TRANSPOSE(array)",
};

/** Function names that start with the word being typed at the end of a formula. */
export function suggest(text: string): { word: string; names: string[] } {
  if (!text.startsWith("=")) return { word: "", names: [] };
  const m = /([A-Za-z][A-Za-z0-9.]*)$/.exec(text);
  if (!m) return { word: "", names: [] };
  const word = m[1].toUpperCase();
  // A cell reference (A1, BC12) is not a function name.
  if (/^[A-Z]{1,3}\d+$/.test(word)) return { word: "", names: [] };
  const names = Object.keys(FUNCS).filter((n) => n.startsWith(word)).slice(0, 8);
  return { word: m[1], names };
}

/** The signature of the function whose brackets the cursor is inside. */
export function hint(text: string): string | null {
  if (!text.startsWith("=")) return null;
  let depth = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === ")") depth++;
    else if (ch === "(") {
      if (depth === 0) {
        const m = /([A-Za-z][A-Za-z0-9.]*)$/.exec(text.slice(0, i));
        return m ? FUNCS[m[1].toUpperCase()] ?? null : null;
      }
      depth--;
    }
  }
  return null;
}

/** What a person typed, read the way Excel reads it. */
export function parseTyped(text: string): { value?: string | number | boolean | null; formula?: string; clear?: boolean; number_format?: string } {
  const t = text.trim();
  if (t === "") return { clear: true };
  if (t.startsWith("=") && t.length > 1) return { formula: t };
  const pct = /^-?[\d,]*\.?\d+\s*%$/.test(t);
  const plain = t.replace(/[₦,\s]/g, "").replace(/%$/, "");
  if (/^-?\d*\.?\d+$/.test(plain)) {
    const n = Number(plain);
    if (Number.isFinite(n)) {
      if (pct) return { value: n / 100, number_format: "0.00%" };
      if (t.includes("₦")) return { value: n, number_format: '"₦"#,##0.00' };
      return { value: n };
    }
  }
  if (/^(true|false)$/i.test(t)) return { value: t.toUpperCase() === "TRUE" };
  return { value: text };
}

/** The number format one decimal place up (+1) or down (-1). */
export function stepDecimals(nf: string | null | undefined, step: 1 | -1): string {
  const base = nf && nf !== "General" ? nf : "#,##0";
  const m = /\.(0+)/.exec(base);
  const dp = m ? m[1].length : 0;
  const next = Math.max(0, Math.min(10, dp + step));
  const zeros = next ? "." + "0".repeat(next) : "";
  if (m) return base.replace(/\.0+/, zeros);
  // No decimals yet: add them after the last 0 of the integer part.
  const i = base.lastIndexOf("0");
  return i < 0 ? `0${zeros}` : base.slice(0, i + 1) + zeros + base.slice(i + 1);
}
