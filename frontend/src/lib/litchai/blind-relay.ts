import "server-only";

import { constants, createCipheriv, createHash, publicEncrypt, randomBytes } from "node:crypto";

/**
 * Blind-relay encryption (PRD §12.6) — the Vercel-side encrypt half.
 *
 * The admin upload server action calls {@link postEncryptedDocument} the instant
 * it receives a client file: the bytes are encrypted with the OCI VM's public
 * key here, in the request path, and only the ciphertext envelope is forwarded.
 * Vercel never buffers plaintext to disk and logs only metadata (client id,
 * ciphertext hash, size) — it is a blind relay, never a holder of readable
 * client data. The private key lives solely on the VM (see
 * `backend/src/litchai/crypto.py`), which is the only place plaintext exists
 * again.
 *
 * The wire format is byte-identical to the Python `litchai.crypto` envelope:
 *   magic "LZAI" | version 1 | alg 1 | klen u16be | wrapped_key | nonce(12) | ct||tag
 * RSA-OAEP(SHA-256) wraps a per-file AES-256-GCM key.
 */

const MAGIC = Buffer.from("LZAI");
const VERSION = 1;
const ALG_RSA_OAEP_AES_GCM = 1;
const NONCE_LEN = 12;
const DEK_LEN = 32;

/** Encrypt `plaintext` into the shared envelope frame using the VM's public PEM. */
export function encryptEnvelope(plaintext: Buffer, publicKeyPem: string): Buffer {
  const dek = randomBytes(DEK_LEN);
  const nonce = randomBytes(NONCE_LEN);

  const cipher = createCipheriv("aes-256-gcm", dek, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const body = Buffer.concat([ciphertext, tag]); // ct || 16-byte tag (matches AESGCM)

  const wrappedKey = publicEncrypt(
    { key: publicKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    dek,
  );

  const header = Buffer.alloc(8);
  MAGIC.copy(header, 0);
  header.writeUInt8(VERSION, 4);
  header.writeUInt8(ALG_RSA_OAEP_AES_GCM, 5);
  header.writeUInt16BE(wrappedKey.length, 6);

  return Buffer.concat([header, wrappedKey, nonce, body]);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — cannot reach LitchAI`);
  return value;
}

export type UploadMeta = {
  clientId: string;
  filename: string;
  mime: string;
  engagementId?: number;
  accountLabel?: string;
};

export type UploadResult = {
  document_id: number;
  status: string;
  duplicate: boolean;
};

/**
 * Encrypt `plaintext` and POST the envelope to the OCI API over the Cloudflare
 * Tunnel, authenticating machine-to-machine with the Access service token.
 * Returns only metadata; the plaintext is discarded once the request is built.
 */
export async function postEncryptedDocument(
  plaintext: Buffer,
  meta: UploadMeta,
): Promise<UploadResult & { ciphertextSha256: string; bytes: number }> {
  // The PEM is stored \n-escaped in env (portable across .env/Doppler/Vercel);
  // Node's crypto needs real newlines.
  const envelope = encryptEnvelope(plaintext, requireEnv("LITCHAI_PUBLIC_KEY").replace(/\\n/g, "\n"));
  const ciphertextSha256 = createHash("sha256").update(envelope).digest("hex");

  const url = new URL("/documents", requireEnv("LITCHAI_API_URL"));
  url.searchParams.set("client_id", meta.clientId);
  url.searchParams.set("filename", meta.filename);
  url.searchParams.set("mime", meta.mime);
  if (meta.engagementId != null) url.searchParams.set("engagement_id", String(meta.engagementId));
  if (meta.accountLabel) url.searchParams.set("account_label", meta.accountLabel);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      // Cloudflare Access service token (machine-to-machine, §12.5).
      "CF-Access-Client-Id": requireEnv("LITCHAI_ACCESS_CLIENT_ID"),
      "CF-Access-Client-Secret": requireEnv("LITCHAI_ACCESS_CLIENT_SECRET"),
    },
    body: new Uint8Array(envelope),
  });

  if (!res.ok) {
    throw new Error(`LitchAI upload failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  const result = (await res.json()) as UploadResult;
  return { ...result, ciphertextSha256, bytes: envelope.length };
}

export type ArchiveResult = {
  archive: string;
  encrypted: boolean;
  documents: { document_id: number; filename: string; status: string; duplicate: boolean }[];
  skipped: { name: string; reason: string }[];
};

/** Thrown when the archive needs a password, or the one given is wrong. */
export class ArchivePasswordError extends Error {
  constructor(readonly code: "password_needed" | "wrong_password", message: string) {
    super(message);
  }
}

/**
 * Encrypt a ZIP, RAR or 7z archive (blind relay) and ask the engine to unpack it.
 * The password, when given, travels only in a header to the engine for this one
 * call; it is never stored or logged here.
 */
export async function postEncryptedArchive(
  plaintext: Buffer,
  meta: { clientId: string; filename: string; password?: string | null },
): Promise<ArchiveResult> {
  const envelope = encryptEnvelope(plaintext, requireEnv("LITCHAI_PUBLIC_KEY").replace(/\\n/g, "\n"));
  const url = new URL("/archives/unpack", requireEnv("LITCHAI_API_URL"));
  url.searchParams.set("client_id", meta.clientId);
  url.searchParams.set("filename", meta.filename);
  const headers: Record<string, string> = {
    "content-type": "application/octet-stream",
    "CF-Access-Client-Id": requireEnv("LITCHAI_ACCESS_CLIENT_ID"),
    "CF-Access-Client-Secret": requireEnv("LITCHAI_ACCESS_CLIENT_SECRET"),
  };
  if (meta.password) headers["X-Archive-Password"] = meta.password;
  const res = await fetch(url, { method: "POST", headers, body: new Uint8Array(envelope) });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: { code?: string; message?: string } | string } | null;
    const d = body?.detail;
    if (res.status === 401 && d && typeof d === "object" && (d.code === "password_needed" || d.code === "wrong_password")) {
      throw new ArchivePasswordError(d.code, d.message ?? "This archive needs a password.");
    }
    const msg = d && typeof d === "object" ? d.message : typeof d === "string" ? d : null;
    throw new Error(msg || `The archive could not be opened (${res.status}).`);
  }
  return (await res.json()) as ArchiveResult;
}
