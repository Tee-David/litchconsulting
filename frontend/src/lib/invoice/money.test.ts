import { describe, it, expect } from "vitest";
import { computeTotals, currencyMeta, formatMoney, num, round2 } from "./money";

describe("num", () => {
  it("passes finite numbers through", () => {
    expect(num(12.5)).toBe(12.5);
  });

  it("parses numeric strings (numeric(14,2) comes back as a string)", () => {
    expect(num("21120.00")).toBe(21120);
  });

  it("coerces junk to 0 rather than NaN", () => {
    for (const v of [null, undefined, "", "abc", {}, NaN, Infinity]) {
      expect(num(v)).toBe(0);
    }
  });
});

describe("round2", () => {
  it("rounds to 2dp", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
  });

  it("clears float drift", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe("computeTotals", () => {
  it("returns zeroed totals for no items", () => {
    expect(computeTotals([])).toEqual({ lines: [], subtotal: 0, taxTotal: 0, total: 0 });
  });

  it("computes a pre-tax line amount and its tax", () => {
    const r = computeTotals([{ quantity: 2, unitPrice: 1000, taxRate: 7.5 }]);
    expect(r.lines).toEqual([{ amount: 2000, tax: 150 }]);
    expect(r.subtotal).toBe(2000);
    expect(r.taxTotal).toBe(150);
    expect(r.total).toBe(2150);
  });

  it("sums multiple lines with mixed tax rates", () => {
    const r = computeTotals([
      { quantity: 1, unitPrice: 100_000, taxRate: 7.5 },
      { quantity: 3, unitPrice: 25_000, taxRate: 0 },
    ]);
    expect(r.subtotal).toBe(175_000);
    expect(r.taxTotal).toBe(7_500);
    expect(r.total).toBe(182_500);
  });

  it("accepts string inputs (form + DB values)", () => {
    const r = computeTotals([{ quantity: "2", unitPrice: "1500.50", taxRate: "7.5" }]);
    expect(r.subtotal).toBe(3001);
    expect(r.total).toBe(3226.08);
  });

  it("treats missing/garbage values as zero instead of NaN-poisoning the total", () => {
    const r = computeTotals([{ quantity: "", unitPrice: "abc", taxRate: "" }]);
    expect(r.total).toBe(0);
    expect(Number.isNaN(r.total)).toBe(false);
  });

  it("rounds each line before summing, so the total matches the printed lines", () => {
    // 0.1 * 3 lines would drift to 0.30000000000000004 if summed unrounded.
    const r = computeTotals([
      { quantity: 1, unitPrice: 0.1, taxRate: 0 },
      { quantity: 1, unitPrice: 0.1, taxRate: 0 },
      { quantity: 1, unitPrice: 0.1, taxRate: 0 },
    ]);
    expect(r.subtotal).toBe(0.3);
  });
});

describe("currencyMeta", () => {
  it("resolves a known code", () => {
    expect(currencyMeta("USD").symbol).toBe("$");
  });

  it("falls back to NGN for an unknown code", () => {
    expect(currencyMeta("XXX").code).toBe("NGN");
  });
});

describe("formatMoney", () => {
  it("defaults to naira and always shows 2dp", () => {
    // Intl may use a non-breaking space; assert on the parts that matter.
    const s = formatMoney(21120);
    expect(s).toContain("21,120.00");
    expect(s).toMatch(/₦|NGN/);
  });

  it("formats other currencies", () => {
    expect(formatMoney(1000, "USD")).toContain("1,000.00");
  });

  it("renders a falsy amount as zero, not blank", () => {
    expect(formatMoney(0)).toContain("0.00");
  });
});
