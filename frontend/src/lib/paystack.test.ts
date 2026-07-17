import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { isValidWebhookSignature, koboFromTotal, mintReference, paystackConfigured } from "./paystack";

// Deliberately NOT shaped like a real key: a literal `sk_test_…` here trips
// GitHub's secret scanner and blocks the push. HMAC doesn't care about shape.
const SECRET = "paystack-test-signing-key";

function sign(body: string, secret = SECRET) {
  return createHmac("sha512", secret).update(body, "utf8").digest("hex");
}

describe("koboFromTotal", () => {
  it("converts naira (major units) to integer kobo", () => {
    expect(koboFromTotal(21120)).toBe(2_112_000);
  });

  it("accepts the numeric(14,2) string the DB returns", () => {
    expect(koboFromTotal("21120.00")).toBe(2_112_000);
  });

  it("rounds rather than truncating, so 0.1+0.2 style drift can't lose a kobo", () => {
    expect(koboFromTotal(1500.555)).toBe(150_056);
    expect(koboFromTotal(0.1 + 0.2)).toBe(30);
  });

  it("always returns an integer (Paystack rejects fractional kobo)", () => {
    for (const v of [1, 1.005, "99.99", 0.014]) {
      expect(Number.isInteger(koboFromTotal(v))).toBe(true);
    }
  });
});

describe("paystackConfigured / isValidWebhookSignature", () => {
  const original = process.env.PAYSTACK_SECRET_KEY;

  beforeEach(() => {
    process.env.PAYSTACK_SECRET_KEY = SECRET;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.PAYSTACK_SECRET_KEY;
    else process.env.PAYSTACK_SECRET_KEY = original;
  });

  it("reports configured only when a secret key is present", () => {
    expect(paystackConfigured()).toBe(true);
    delete process.env.PAYSTACK_SECRET_KEY;
    expect(paystackConfigured()).toBe(false);
  });

  it("accepts a genuine HMAC-SHA512 of the raw body", () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "LC-1" } });
    expect(isValidWebhookSignature(body, sign(body))).toBe(true);
  });

  it("rejects a signature for a tampered body", () => {
    const body = JSON.stringify({ event: "charge.success", data: { amount: 100 } });
    const tampered = JSON.stringify({ event: "charge.success", data: { amount: 999_999 } });
    expect(isValidWebhookSignature(tampered, sign(body))).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    const body = "{}";
    expect(isValidWebhookSignature(body, sign(body, "paystack-other-signing-key"))).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(isValidWebhookSignature("{}", null)).toBe(false);
  });

  it("rejects a wrong-length signature without throwing (timingSafeEqual needs equal lengths)", () => {
    expect(() => isValidWebhookSignature("{}", "abc")).not.toThrow();
    expect(isValidWebhookSignature("{}", "abc")).toBe(false);
  });

  it("is byte-exact on the raw body — re-serialising must invalidate it", () => {
    const raw = '{"event":"charge.success","data":{"reference":"LC-1"}}';
    const sig = sign(raw);
    const reserialised = JSON.stringify(JSON.parse(raw), null, 2);
    expect(isValidWebhookSignature(raw, sig)).toBe(true);
    expect(isValidWebhookSignature(reserialised, sig)).toBe(false);
  });
});

describe("mintReference", () => {
  it("embeds the invoice number so a reference is traceable", () => {
    expect(mintReference("LC-INV-0007")).toContain("LC-INV-0007");
  });

  it("is unique across calls (replays must not collide)", () => {
    const refs = new Set(Array.from({ length: 50 }, () => mintReference("LC-INV-0007")));
    expect(refs.size).toBe(50);
  });
});
