import type { WbConversation, WbFirstLook } from "@/lib/litchai/workbench";

export const WORKBENCH_UPLOAD_ACCEPT = ".xlsx,.xlsm,.xls,.ods,.csv,.tsv,.txt,.json,.docx,.pdf,.png,.jpg,.jpeg";

export type WorkbenchUploadResult =
  | { ok: true; id: string; conversation?: WbConversation; firstLook?: WbFirstLook; /** Still being read: attach this document id when ready. */ pending?: number }
  | { ok: false; error: string };

/** Send a file from this computer into a workbench (new or existing). The server encrypts it before it goes on. */
export async function uploadToWorkbench(file: File, target: { conversationId?: string; requestId?: string | null }): Promise<WorkbenchUploadResult> {
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
    return { ok: false, error: "The upload did not reach the server. Check your connection and try again." };
  }
}
