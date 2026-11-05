/**
 * Throwaway data for E2E runs: a real user signed up through Better Auth,
 * promoted with SQL, enrolled in two-step with a computed TOTP; plus clients,
 * requests and private-bucket files. Every row and object created here is
 * tracked and removed by `cleanup()`, including the analysis server's copy.
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { APIRequestContext } from "@playwright/test";
import { BASE_URL, loadEnv, need } from "./env";

loadEnv();

let pool: Pool | null = null;
export function db(): Pool {
  if (!pool) {
    const cert = process.env.COCKROACH_CA_CERT || process.env.COCKROACHDB_CERT;
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || need("COCKROACHDB_URL"),
      ssl: {
        ca: cert && cert.includes("BEGIN CERTIFICATE") ? cert : readFileSync(join(__dirname, "..", "..", "certs", "cockroach-ca.crt"), "utf8"),
        rejectUnauthorized: true,
      },
      max: 3,
    });
  }
  return pool;
}

export async function closeDb() {
  await pool?.end();
  pool = null;
}

// --- TOTP (RFC 6238, SHA-1, 30 s, 6 digits) ----------------------------------------
function base32(s: string): Buffer {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of s.replace(/=+$/, "").toUpperCase()) {
    const v = alpha.indexOf(ch);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, "0");
  }
  const out: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}

export function totp(secret: string, at = Date.now()): string {
  const key = /^[A-Z2-7=]+$/i.test(secret) ? base32(secret) : Buffer.from(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

// --- tracking + cleanup -------------------------------------------------------------
const created = {
  users: new Set<string>(),
  clients: new Set<string>(),
  requests: new Set<string>(),
  r2Keys: new Set<string>(),
  emails: new Set<string>(),
};

function s3() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${need("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || need("R2_ACCESS_KEY"),
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || need("R2_SECRET_KEY"),
    },
  });
}

export async function putPrivate(key: string, body: Buffer, contentType: string) {
  await s3().send(new PutObjectCommand({ Bucket: need("R2_PRIVATE_BUCKET"), Key: key, Body: body, ContentType: contentType }));
  created.r2Keys.add(key);
}

export function trackR2(key: string) {
  created.r2Keys.add(key);
}

export function trackRequest(id: string) {
  created.requests.add(id);
}

export function trackClient(id: string) {
  created.clients.add(id);
}

async function eraseOnAnalysisServer(clientId: string) {
  const url = process.env.LITCHAI_API_URL;
  if (!url) return;
  await fetch(new URL(`/clients/${clientId}/erase`, url), {
    method: "POST",
    headers: {
      "CF-Access-Client-Id": need("LITCHAI_ACCESS_CLIENT_ID"),
      "CF-Access-Client-Secret": need("LITCHAI_ACCESS_CLIENT_SECRET"),
    },
  }).catch(() => undefined);
}

/** Remove everything this run created. Safe to call more than once. */
export async function cleanup() {
  const q = db();
  // Files the app itself stored for these requests (deliverables, workbench saves).
  if (created.requests.size) {
    const ids = [...created.requests];
    const docs = await q.query<{ r2_key: string }>(`SELECT r2_key FROM service_request_document WHERE request_id = ANY($1::uuid[])`, [ids]);
    docs.rows.forEach((d) => created.r2Keys.add(d.r2_key));
    const inv = await q.query<{ invoice_id: string | null }>(`SELECT invoice_id FROM service_request WHERE id = ANY($1::uuid[])`, [ids]);
    const invoiceIds = inv.rows.map((r) => r.invoice_id).filter(Boolean) as string[];
    for (const t of ["service_request_document", "service_request_event", "request_item", "review_round", "request_assignment", "workbench_conversation"]) {
      await q.query(`DELETE FROM ${t} WHERE request_id = ANY($1::uuid[])`, [ids]).catch(() => undefined);
    }
    await q.query(`DELETE FROM payment WHERE request_id = ANY($1::uuid[])`, [ids]).catch(() => undefined);
    if (invoiceIds.length) {
      await q.query(`DELETE FROM payment WHERE invoice_id = ANY($1::uuid[])`, [invoiceIds]).catch(() => undefined);
      await q.query(`DELETE FROM invoice_item WHERE invoice_id = ANY($1::uuid[])`, [invoiceIds]).catch(() => undefined);
      await q.query(`DELETE FROM invoice WHERE id = ANY($1::uuid[]) OR parent_invoice_id = ANY($1::uuid[])`, [invoiceIds]).catch(() => undefined);
    }
    await q.query(`DELETE FROM audit_log WHERE entity_id = ANY($1::text[])`, [ids]).catch(() => undefined);
    await q.query(`DELETE FROM service_request WHERE id = ANY($1::uuid[])`, [ids]);
  }
  if (created.users.size) {
    const ids = [...created.users];
    const reqs = await q.query<{ id: string }>(`SELECT id FROM service_request WHERE user_id = ANY($1::text[])`, [ids]);
    if (reqs.rows.length) {
      reqs.rows.forEach((r) => created.requests.add(r.id));
      const users = new Set(created.users);
      created.users.clear();
      await cleanup();
      users.forEach((u) => created.users.add(u));
    }
    const wbs = await q.query<{ id: string }>(`SELECT id FROM workbench_conversation WHERE created_by = ANY($1::text[])`, [ids]);
    if (wbs.rows.length) await q.query(`DELETE FROM workbench_conversation WHERE id = ANY($1::text[])`, [wbs.rows.map((r) => r.id)]);
    const cl = await q.query<{ id: string }>(`SELECT id FROM client WHERE user_id = ANY($1::text[])`, [ids]);
    cl.rows.forEach((c) => created.clients.add(c.id));
    for (const sql of [
      `DELETE FROM notification WHERE user_id = ANY($1::text[])`,
      `DELETE FROM notification_pref WHERE user_id = ANY($1::text[])`,
      `DELETE FROM push_subscription WHERE user_id = ANY($1::text[])`,
      `DELETE FROM session_two_step WHERE user_id = ANY($1::text[])`,
      `DELETE FROM user_onboarding WHERE user_id = ANY($1::text[])`,
      `DELETE FROM client_member WHERE user_id = ANY($1::text[])`,
      `DELETE FROM sage_message WHERE conversation_id IN (SELECT id FROM sage_conversation WHERE user_id = ANY($1::text[]))`,
      `DELETE FROM sage_conversation WHERE user_id = ANY($1::text[])`,
      `DELETE FROM audit_log WHERE actor_id = ANY($1::text[]) OR entity_id = ANY($1::text[])`,
      `DELETE FROM "twoFactor" WHERE "userId" = ANY($1::text[])`,
      `DELETE FROM "session" WHERE "userId" = ANY($1::text[])`,
      `DELETE FROM "account" WHERE "userId" = ANY($1::text[])`,
      `DELETE FROM "user" WHERE id = ANY($1::text[])`,
    ]) {
      await q.query(sql, [ids]).catch(() => undefined);
    }
  }
  for (const email of created.emails) {
    await q.query(`DELETE FROM "verification" WHERE identifier = $1 OR value LIKE $2`, [email, `%${email}%`]).catch(() => undefined);
    await q.query(`DELETE FROM request_draft WHERE email = $1`, [email]).catch(() => undefined);
    await q.query(`DELETE FROM email_outbox WHERE "to" = $1`, [email]).catch(() => undefined);
  }
  if (created.clients.size) {
    const ids = [...created.clients];
    for (const id of ids) await eraseOnAnalysisServer(id);
    await q.query(`DELETE FROM client_note WHERE client_id = ANY($1::uuid[])`, [ids]).catch(() => undefined);
    await q.query(`DELETE FROM audit_log WHERE entity_id = ANY($1::text[])`, [ids]).catch(() => undefined);
    await q.query(`DELETE FROM client WHERE id = ANY($1::uuid[])`, [ids]);
  }
  for (const key of created.r2Keys) {
    await s3().send(new DeleteObjectCommand({ Bucket: need("R2_PRIVATE_BUCKET"), Key: key })).catch(() => undefined);
  }
  created.users.clear();
  created.clients.clear();
  created.requests.clear();
  created.r2Keys.clear();
  created.emails.clear();
}

// --- users --------------------------------------------------------------------------
export type TestUser = { id: string; email: string; password: string; name: string; totpSecret?: string };

export function throwawayEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}-${randomBytes(3).toString("hex")}@example.test`;
}

/** Sign up through Better Auth, then verify the email (and set the role) in SQL. */
export async function signUp(api: APIRequestContext, opts: { tag: string; role?: "admin" | "staff" | "client"; name?: string }): Promise<TestUser> {
  const email = throwawayEmail(opts.tag);
  const password = `E2e!${randomBytes(12).toString("base64url")}`;
  const name = opts.name ?? `E2E ${opts.tag}`;
  created.emails.add(email);
  const res = await api.post(`${BASE_URL}/api/auth/sign-up/email`, { data: { email, password, name }, headers: { Origin: BASE_URL } });
  if (!res.ok()) throw new Error(`sign-up failed: ${res.status()} ${await res.text()}`);
  const row = await db().query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [email]);
  const id = row.rows[0]?.id;
  if (!id) throw new Error("signed-up user not found");
  created.users.add(id);
  await db().query(`UPDATE "user" SET "emailVerified" = true, role = $2 WHERE id = $1`, [id, opts.role ?? "client"]);
  // Better Auth may have signed the new user in before verification; start clean.
  await db().query(`DELETE FROM "session" WHERE "userId" = $1`, [id]);
  return { id, email, password, name };
}

async function post(api: APIRequestContext, path: string, data: unknown) {
  const res = await api.post(`${BASE_URL}/api/auth${path}`, { data, headers: { Origin: BASE_URL } });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (!res.ok()) throw new Error(`${path} failed: ${res.status()} ${text.slice(0, 300)}`);
  return body;
}

/** Password sign-in; when two-step is on, completes it with a fresh TOTP. */
export async function signIn(api: APIRequestContext, u: TestUser) {
  const body = await post(api, "/sign-in/email", { email: u.email, password: u.password });
  if (body.twoFactorRedirect) {
    if (!u.totpSecret) throw new Error("two-step required but no secret");
    await post(api, "/two-factor/verify-totp", { code: totp(u.totpSecret) });
  }
}

/** Enrol two-step (admin/staff need it) and leave the context signed in with a verified session. */
export async function enrolTwoStep(api: APIRequestContext, u: TestUser) {
  await post(api, "/sign-in/email", { email: u.email, password: u.password });
  const en = await post(api, "/two-factor/enable", { password: u.password });
  const uri = String(en.totpURI ?? "");
  const secret = new URL(uri).searchParams.get("secret");
  if (!secret) throw new Error("no TOTP secret in the enable response");
  u.totpSecret = secret;
  await post(api, "/two-factor/verify-totp", { code: totp(secret) });
  await post(api, "/sign-out", {});
  // Wait for the next 30 s window so the sign-in code is not a replay.
  const wait = 30_000 - (Date.now() % 30_000) + 500;
  await new Promise((r) => setTimeout(r, wait));
  await signIn(api, u);
}

// --- business data --------------------------------------------------------------------
export async function createClient(opts: { name: string; userId?: string | null; aiMode?: "cloud_masked" | "local_only" }) {
  const id = randomUUID();
  await db().query(`INSERT INTO client (id, name, company, email, user_id, ai_mode) VALUES ($1, $2, $2, $3, $4, $5)`, [
    id,
    opts.name,
    `${id.slice(0, 8)}@example.test`,
    opts.userId ?? null,
    opts.aiMode ?? "cloud_masked",
  ]);
  created.clients.add(id);
  return id;
}

export async function createRequest(opts: { clientId: string; userId: string; status?: string; serviceSlug?: string }) {
  const id = randomUUID();
  const number = `REQ-E2E-${Date.now().toString().slice(-6)}`;
  await db().query(
    `INSERT INTO service_request (id, number, client_id, user_id, service_slug, service_name, pricing_mode, status)
     VALUES ($1, $2, $3, $4, $5, 'Bookkeeping review (E2E)', 'quote', $6)`,
    [id, number, opts.clientId, opts.userId, opts.serviceSlug ?? "e2e-bookkeeping", opts.status ?? "in_progress"],
  );
  created.requests.add(id);
  return { id, number };
}

/** A client upload on a request: bytes in the private bucket + the document row. */
export async function addRequestFile(requestId: string, fileName: string, body: Buffer, contentType: string) {
  const key = `requests/${requestId}/e2e/${Date.now()}-${fileName}`;
  await putPrivate(key, body, contentType);
  const id = randomUUID();
  await db().query(
    `INSERT INTO service_request_document (id, request_id, kind, file_name, content_type, size_bytes, r2_key, scan_status, uploaded_by_role, uploaded_by_name)
     VALUES ($1, $2, 'client_upload', $3, $4, $5, $6, 'clean', 'client', 'E2E client')`,
    [id, requestId, fileName, contentType, body.length, key],
  );
  return id;
}
