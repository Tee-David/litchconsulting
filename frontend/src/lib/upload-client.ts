"use client";

export type UploadKind = "avatar" | "logo" | "cover" | "template" | "doc";

/**
 * Upload a file to R2. Prefers a direct browser→R2 presigned PUT (no bandwidth
 * through our function); falls back to the server-side route if the presign/PUT
 * path fails (e.g. CORS not yet propagated).
 */
export async function uploadFile(file: File, kind: UploadKind): Promise<string> {
  try {
    const res = await fetch("/api/upload/presign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, contentType: file.type, size: file.size }),
    });
    if (res.ok) {
      const { uploadUrl, publicUrl } = await res.json();
      const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
      if (put.ok) return publicUrl as string;
    } else if (res.status === 400) {
      // a validation error (type/size) — surface it instead of falling back
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Upload not allowed");
    }
  } catch (e) {
    if (e instanceof Error && /allowed|type|large/i.test(e.message)) throw e;
    // otherwise fall through to server-side upload
  }

  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Upload failed");
  }
  const { url } = await res.json();
  return url as string;
}
