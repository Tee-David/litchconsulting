import { describe, expect, it } from "vitest";
import { colIndex, colLetter, parseRef, rangeLabel, rangeRef, REF_IN_TEXT } from "./refs";

describe("workbench cell references", () => {
  it("converts columns both ways", () => {
    expect(colLetter(1)).toBe("A");
    expect(colLetter(26)).toBe("Z");
    expect(colLetter(27)).toBe("AA");
    expect(colIndex("AB")).toBe(28);
  });

  it("parses plain, quoted and absolute refs", () => {
    expect(parseRef("Ledger!B2:F140")).toEqual({ sheet: "Ledger", r0: 2, r1: 140, c0: 2, c1: 6 });
    expect(parseRef("'P&L'!$C$24")).toEqual({ sheet: "P&L", r0: 24, r1: 24, c0: 3, c1: 3 });
    expect(parseRef("'Owner''s'!A1")?.sheet).toBe("Owner's");
    expect(parseRef("D5", "Bank")).toEqual({ sheet: "Bank", r0: 5, r1: 5, c0: 4, c1: 4 });
    expect(parseRef("D5")).toBeNull();
    expect(parseRef("Ledger!nope")).toBeNull();
  });

  it("labels ranges for the chip", () => {
    const r = parseRef("Ledger!B2:F140")!;
    expect(rangeLabel(r)).toBe("Ledger!B2:F140 (139 rows)");
    expect(rangeRef({ sheet: "P&L", r0: 5, r1: 5, c0: 3, c1: 3 })).toBe("'P&L'!C5");
  });

  it("finds citations inside prose", () => {
    const text = "Net profit is in 'P&L'!C24, from Ledger!E2:E13 and Bank!C12.";
    expect([...text.matchAll(REF_IN_TEXT)].map((m) => m[0])).toEqual(["'P&L'!C24", "Ledger!E2:E13", "Bank!C12"]);
  });
});
