"use client";

export type UploadKind = "avatar" | "logo" | "cover" | "template" | "doc";

/** PUT a file to a presigned URL with upload-progress reporting (fetch can't). */
function xhrPut(url: string, file: File, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

/**
 * Upload a file to the PUBLIC R2 bucket. Prefers a direct browser→R2 presigned
 * PUT (no bandwidth through our function); falls back to the server-side route
 * if the presign/PUT path fails (e.g. CORS not yet propagated).
 */
export async function uploadFile(
  file: File,
  kind: UploadKind,
  onProgress?: (pct: number) => void
): Promise<string> {
  try {
    const res = await fetch("/api/upload/presign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, contentType: file.type, size: file.size }),
    });
    if (res.ok) {
      const { uploadUrl, publicUrl } = await res.json();
      await xhrPut(uploadUrl, file, onProgress);
      return publicUrl as string;
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

/**
 * Upload a file for a service request to the PRIVATE bucket. Direct presigned
 * PUT first; if that PUT is blocked (bucket CORS), fall back to a server relay
 * for smaller files. Returns the stored R2 key — the caller records it via the
 * appropriate server action. Throws a human-readable message on failure.
 */
export async function uploadRequestFile(
  requestId: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ key: string }> {
  const presign = await fetch(`/api/requests/${requestId}/docs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    }),
  });
  const body = (await presign.json().catch(() => ({}))) as {
    ok?: boolean;
    uploadUrl?: string;
    key?: string;
    error?: string;
  };
  // A validation rejection (type/size/auth) is terminal — surface it verbatim.
  if (!presign.ok || !body.ok || !body.uploadUrl || !body.key) {
    throw new Error(body.error || "Could not start the upload.");
  }

  try {
    await xhrPut(body.uploadUrl, file, onProgress);
    return { key: body.key };
  } catch (directErr) {
    // Direct PUT failed (most often bucket CORS). Relay smaller files through
    // the server; larger files need the direct path to be unblocked.
    const form = new FormData();
    form.append("file", file);
    const relay = await fetch(`/api/requests/${requestId}/docs/relay`, {
      method: "POST",
      body: form,
    });
    const relayBody = (await relay.json().catch(() => ({}))) as { ok?: boolean; key?: string; error?: string };
    if (relay.ok && relayBody.ok && relayBody.key) {
      onProgress?.(100);
      return { key: relayBody.key };
    }
    const reason = relayBody.error || (directErr instanceof Error ? directErr.message : "upload failed");
    throw new Error(`Upload failed (${reason}). Please try again.`);
  }
}
