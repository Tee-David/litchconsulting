import type { WbConversation, WbFirstLook } from "@/lib/litchai/workbench";

export const WORKBENCH_UPLOAD_ACCEPT = ".xlsx,.xlsm,.xls,.ods,.csv,.tsv,.txt,.json,.docx,.pdf,.png,.jpg,.jpeg,.zip,.rar,.7z";
/** Files up to this size and not archives take the short path (one request). */
const DIRECT_MAX = 4 * 1024 * 1024;
export const WORKBENCH_MAX_BYTES = 20 * 1024 * 1024;
const ARCHIVE = /\.(zip|rar|7z)$/i;

export type WorkbenchUploadResult =
  | {
      ok: true;
      id: string;
      conversation?: WbConversation;
      firstLook?: WbFirstLook;
      /** Still being read: attach this document id when ready (the first of `pendingIds`). */
      pending?: number;
      pendingIds?: number[];
      /** Files added (an archive gives several). */
      added?: string[];
      /** Files in an archive that were not added, and why. */
      skipped?: { name: string; reason: string }[];
    }
  | { ok: false; error: string };

/** Ask the person for an archive's password; null means they cancelled. */
export type AskPassword = (fileName: string, wrong: boolean) => Promise<string | null>;

const NETWORK = "The upload did not reach the server. Check your connection and try again.";

/**
 * Send a file from this computer into a workbench (new or existing). Small files go in
 * one request; larger files (up to 20 MB) and ZIP / RAR / 7z archives go straight to
 * private storage first. An archive with a password asks for it with `askPassword`.
 */
export async function uploadToWorkbench(
  file: File,
  target: { conversationId?: string; requestId?: string | null },
  opts: { askPassword?: AskPassword } = {},
): Promise<WorkbenchUploadResult> {
  if (file.size > WORKBENCH_MAX_BYTES) return { ok: false, error: "Each file must be 20 MB or smaller." };
  if (file.size <= DIRECT_MAX && !ARCHIVE.test(file.name)) return direct(file, target);

  // 1) a short-lived link into private storage, 2) the browser puts the file there, 3) finish.
  let start: { ok?: boolean; error?: string; url?: string; key?: string; exp?: number; token?: string; contentType?: string };
  try {
    const res = await fetch("/api/workbench/upload/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size, conversationId: target.conversationId, requestId: target.requestId }),
    });
    start = await res.json().catch(() => ({}));
    if (!res.ok || !start.ok) return { ok: false, error: start.error || "The file could not be added." };
  } catch {
    return { ok: false, error: NETWORK };
  }
  try {
    const put = await fetch(start.url!, { method: "PUT", headers: { "content-type": start.contentType! }, body: file });
    if (!put.ok) return { ok: false, error: "The file could not be stored. Try again." };
  } catch {
    return { ok: false, error: NETWORK };
  }
  let password: string | undefined;
  for (let attempt = 0; attempt < 6; attempt++) {
    let body: Partial<Extract<WorkbenchUploadResult, { ok: true }>> & { ok?: boolean; error?: string; needPassword?: boolean; wrongPassword?: boolean };
    try {
      const res = await fetch("/api/workbench/upload/finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: start.key, exp: start.exp, token: start.token, name: file.name, conversationId: target.conversationId, requestId: target.requestId, password }),
      });
      body = await res.json().catch(() => ({}));
    } catch {
      return { ok: false, error: NETWORK };
    }
    if (body.ok) return body as WorkbenchUploadResult;
    if (body.needPassword && opts.askPassword) {
      const pw = await opts.askPassword(file.name, Boolean(body.wrongPassword));
      if (pw === null) return { ok: false, error: "Cancelled: the archive needs its password." };
      password = pw;
      continue;
    }
    return { ok: false, error: body.error || "The file could not be added." };
  }
  return { ok: false, error: "Too many tries. Check the password and add the archive again." };
}

async function direct(file: File, target: { conversationId?: string; requestId?: string | null }): Promise<WorkbenchUploadResult> {
  const form = new FormData();
  form.append("file", file);
  if (target.conversationId) form.append("conversationId", target.conversationId);
  if (target.requestId) form.append("requestId", target.requestId);
  try {
    const res = await fetch("/api/workbench/upload", { method: "POST", body: form });
    const body = (await res.json().catch(() => ({}))) as Partial<WorkbenchUploadResult> & { error?: string };
    if (!res.ok || !body.ok) return { ok: false, error: body.error || "The file could not be added." };
    return body as WorkbenchUploadResult;
  } catch {
    return { ok: false, error: NETWORK };
  }
}
