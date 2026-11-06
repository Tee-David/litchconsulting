import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "./turnstile";

const TOKEN = "x".repeat(40);

describe("verifyTurnstile policies", () => {
  beforeEach(() => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("skips when no secret is configured (local dev)", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(await verifyTurnstile(undefined, undefined, "closed")).toEqual({ ok: true, skipped: true });
  });

  it("refuses a missing token under both policies", async () => {
    expect((await verifyTurnstile(undefined, undefined, "open")).ok).toBe(false);
    expect((await verifyTurnstile(null, undefined, "closed")).ok).toBe(false);
  });

  it("fails CLOSED for auth when Cloudflare cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const r = await verifyTurnstile(TOKEN, "1.2.3.4", "closed");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.unavailable).toBe(true);
  });

  it("fails CLOSED when siteverify answers with a server error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("busy", { status: 503 })));
    expect((await verifyTurnstile(TOKEN, undefined, "closed")).ok).toBe(false);
  });

  it("fails OPEN for contact/newsletter when Cloudflare cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(await verifyTurnstile(TOKEN, undefined, "open")).toEqual({ ok: true, skipped: true });
  });

  it("refuses a rejected token under both policies", async () => {
    const reject = () => Promise.resolve(Response.json({ success: false, "error-codes": ["invalid-input-response"] }));
    vi.stubGlobal("fetch", vi.fn().mockImplementation(reject));
    expect((await verifyTurnstile(TOKEN, undefined, "open")).ok).toBe(false);
    expect((await verifyTurnstile(TOKEN, undefined, "closed")).ok).toBe(false);
  });

  it("passes a good token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: true })));
    expect(await verifyTurnstile(TOKEN, undefined, "closed")).toEqual({ ok: true });
  });
});
