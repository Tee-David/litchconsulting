import "server-only";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/**
 * Paystack REST client (redirect/Standard flow — no client SDK, no popup).
 * Direct server-to-Paystack calls only; test vs live is purely which secret
 * key is present in the environment. Degrades gracefully when unconfigured
 * (mirrors emailConfigured / r2Configured).
 *
 * Contract notes (verified against Paystack docs):
 * - amounts are integer KOBO
 * - webhook `x-paystack-signature` = HMAC-SHA512 of the RAW request body
 * - non-200 webhook responses are retried (3-min ×4, then hourly for 72h) —
 *   handlers must be idempotent and always return 200
 * - never trust the callback redirect alone: re-verify status+amount+currency
 */

const BASE = "https://api.paystack.co";

function secretKey(): string {
  return process.env.PAYSTACK_SECRET_KEY || "";
}

export function paystackConfigured(): boolean {
  return Boolean(secretKey());
}

export type PaystackTransaction = {
  id?: number;
  status?: string; // success | failed | abandoned | ...
  reference?: string;
  amount?: number; // kobo
  currency?: string;
  channel?: string;
  paid_at?: string;
  gateway_response?: string;
  customer?: { email?: string };
  metadata?: Record<string, unknown> | null;
};

type PaystackEnvelope<T> = { status: boolean; message: string; data?: T };

async function paystackFetch<T>(path: string, init?: RequestInit): Promise<PaystackEnvelope<T>> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as PaystackEnvelope<T> | null;
  if (!body) return { status: false, message: `Paystack HTTP ${res.status}` };
  return body;
}

/** Our reference format: LC-{invoiceNumber}-{6 hex}. Fresh per attempt. */
export function mintReference(invoiceNumber: string): string {
  return `LC-${invoiceNumber}-${randomBytes(3).toString("hex")}`;
}

export async function initializeTransaction(opts: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<{ ok: boolean; authorizationUrl?: string; accessCode?: string; error?: string }> {
  if (!paystackConfigured()) return { ok: false, error: "Payments are not configured yet." };
  const r = await paystackFetch<{ authorization_url: string; access_code: string; reference: string }>(
    "/transaction/initialize",
    {
      method: "POST",
      body: JSON.stringify({
        email: opts.email,
        amount: opts.amountKobo,
        currency: "NGN",
        reference: opts.reference,
        callback_url: opts.callbackUrl,
        metadata: opts.metadata ?? {},
      }),
    }
  );
  if (!r.status || !r.data) return { ok: false, error: r.message || "Could not start payment." };
  return { ok: true, authorizationUrl: r.data.authorization_url, accessCode: r.data.access_code };
}

export async function verifyTransaction(
  reference: string
): Promise<{ ok: boolean; data?: PaystackTransaction; error?: string }> {
  if (!paystackConfigured()) return { ok: false, error: "Payments are not configured yet." };
  const r = await paystackFetch<PaystackTransaction>(
    `/transaction/verify/${encodeURIComponent(reference)}`
  );
  if (!r.status || !r.data) return { ok: false, error: r.message || "Could not verify payment." };
  return { ok: true, data: r.data };
}

/** Constant-time HMAC-SHA512 check of the raw webhook body. */
export function isValidWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !paystackConfigured()) return false;
  const expected = createHmac("sha512", secretKey()).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function koboFromTotal(total: string | number): number {
  return Math.round(Number(total) * 100);
}
