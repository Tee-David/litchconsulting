import "server-only";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Accept both the canonical names and the project's existing Doppler names.
const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY;
const bucket = process.env.R2_BUCKET_NAME;
// public base URL (r2.dev or a custom domain), no trailing slash
const publicBase = (process.env.R2_PUBLIC_DOMAIN || process.env.PUBLIC_R2_URL || "").replace(/\/$/, "");

/** Shared resolved R2 config (also used by the presign route). */
export const r2Config = { accountId, accessKeyId, secretAccessKey, bucket, publicBase };

export const r2Configured = !!(accountId && accessKeyId && secretAccessKey && bucket && publicBase);

let _client: S3Client | null = null;
function client() {
  if (!r2Configured) throw new Error("R2 is not configured");
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    });
  }
  return _client;
}

export function publicUrl(key: string) {
  return `${publicBase}/${key}`;
}

export async function uploadObject(key: string, body: Buffer | Uint8Array, contentType: string) {
  await client().send(new PutObjectCommand({ Bucket: bucket!, Key: key, Body: body, ContentType: contentType }));
  return publicUrl(key);
}

export async function deleteObject(key: string) {
  await client().send(new DeleteObjectCommand({ Bucket: bucket!, Key: key }));
}

/** Derive the storage key from a previously returned public URL (for deletes). */
export function keyFromUrl(url: string): string | null {
  if (!publicBase || !url.startsWith(publicBase + "/")) return null;
  return url.slice(publicBase.length + 1);
}
