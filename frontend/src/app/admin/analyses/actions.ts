"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/server-user";
import { postEncryptedDocument } from "@/lib/litchai/blind-relay";
import {
  askEngagement,
  recategorizeLine,
  transitionEngagement,
  type EngagementAskResponse,
} from "@/lib/litchai/client";

type Result<T = unknown> = { ok: boolean; error?: string } & Partial<T>;

/**
 * Blind-relay upload (PRD §12.6). The file is encrypted with the VM's public key
 * the instant it arrives and only the ciphertext is forwarded; we log metadata
 * only — never the filename's contents, never a line item.
 */
export async function uploadDocument(formData: FormData): Promise<Result<{ documentId: number; duplicate: boolean }>> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };

  const file = formData.get("file");
  const clientId = String(formData.get("clientId") ?? "");
  if (!(file instanceof File) || !clientId) return { ok: false, error: "File and client are required." };

  const engagementIdRaw = formData.get("engagementId");
  const accountLabel = formData.get("accountLabel");
  const plaintext = Buffer.from(await file.arrayBuffer());

  try {
    const result = await postEncryptedDocument(plaintext, {
      clientId,
      filename: file.name,
      mime: file.type || "application/octet-stream",
      engagementId: engagementIdRaw ? Number(engagementIdRaw) : undefined,
      accountLabel: accountLabel ? String(accountLabel) : undefined,
    });
    // metadata only — no plaintext, no extracted content (§12.6)
    console.info("litchai.upload", {
      clientId,
      ciphertextSha256: result.ciphertextSha256,
      bytes: result.bytes,
      documentId: result.document_id,
      duplicate: result.duplicate,
    });
    revalidatePath("/admin/analyses");
    return { ok: true, documentId: result.document_id, duplicate: result.duplicate };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed" };
  }
}

export async function recategorize(
  documentId: number,
  lineItemId: number,
  newCode: string,
): Promise<Result<{ categoryCode: string }>> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  try {
    const res = await recategorizeLine(documentId, lineItemId, newCode);
    revalidatePath(`/admin/analyses/${documentId}`);
    return { ok: true, categoryCode: res.category_code };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Recategorize failed" };
  }
}

export async function engagementAction(
  engagementId: number,
  action: "submit" | "approve" | "reject" | "lock" | "reopen",
  documentId: number,
): Promise<Result<{ status: string }>> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  try {
    const res = await transitionEngagement(engagementId, action);
    revalidatePath(`/admin/analyses/${documentId}`);
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Action failed" };
  }
}

/** Ask the review assistant (explain-only; edits come back as proposals). */
export async function askAssistant(
  engagementId: number,
  question: string,
): Promise<Result<{ response: EngagementAskResponse }>> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  try {
    return { ok: true, response: await askEngagement(engagementId, question) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Assistant unavailable" };
  }
}
