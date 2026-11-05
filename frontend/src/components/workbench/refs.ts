/** Cell references: `Ledger!B2`, `'P&L'!C5:C9`, `Bank!A:A`. 1-based rows/cols. */
export type Range = { sheet: string; r0: number; r1: number; c0: number; c1: number };

export function colLetter(c: number): string {
  let s = "";
  let n = c;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

const CELL = /^\$?([A-Za-z]{1,3})\$?(\d+)?$/;

/** Global pattern for finding references inside prose. */
export const REF_IN_TEXT = /(?:'(?:[^']|'')+'|[A-Za-z_][\w.&]*)!\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?/g;

export function parseRef(ref: string, fallbackSheet?: string): Range | null {
  const t = ref.trim();
  const bang = t.lastIndexOf("!");
  let sheet = fallbackSheet ?? "";
  let rng = t;
  if (bang > 0) {
    sheet = t.slice(0, bang);
    rng = t.slice(bang + 1);
    if (sheet.startsWith("'") && sheet.endsWith("'")) sheet = sheet.slice(1, -1).replace(/''/g, "'");
  }
  if (!sheet) return null;
  const [a, b] = rng.split(":");
  const ma = CELL.exec(a ?? "");
  const mb = b ? CELL.exec(b) : ma;
  if (!ma || !mb) return null;
  const r0 = ma[2] ? Number(ma[2]) : 1;
  const r1 = mb[2] ? Number(mb[2]) : 1_000_000;
  const c0 = colIndex(ma[1]);
  const c1 = colIndex(mb[1]);
  return { sheet, r0: Math.min(r0, r1), r1: Math.max(r0, r1), c0: Math.min(c0, c1), c1: Math.max(c0, c1) };
}

export function inRange(r: Range, row: number, col: number) {
  return row >= r.r0 && row <= r.r1 && col >= r.c0 && col <= r.c1;
}

export function quoteSheet(name: string) {
  return /^[A-Za-z_][\w.]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}

export function rangeRef(r: Range): string {
  const a = `${colLetter(r.c0)}${r.r0}`;
  const b = `${colLetter(r.c1)}${r.r1}`;
  return `${quoteSheet(r.sheet)}!${a === b ? a : `${a}:${b}`}`;
}

/** The chip text: `Ledger!B2:F140 (139 rows)`. */
export function rangeLabel(r: Range): string {
  const n = r.r1 - r.r0 + 1;
  const single = r.r0 === r.r1 && r.c0 === r.c1;
  return single ? rangeRef(r) : `${rangeRef(r)} (${n.toLocaleString("en-NG")} row${n === 1 ? "" : "s"})`;
}
