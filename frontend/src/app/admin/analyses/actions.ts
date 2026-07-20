"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/server-user";
import { postEncryptedDocument } from "@/lib/litchai/blind-relay";
import {
  askEngagement,
  assistantSelection,
  attachDocumentToEngagement,
  compileEngagement,
  createEngagement,
  getDocument,
  recategorizeLine,
  transitionEngagement,
  type CompilableTemplate,
  type CompileResult,
  type EngagementAskResponse,
  type SelectionResult,
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

/**
 * Make the pipeline reachable (Wave 2, Step 1): create the engagement a compile
 * hangs off, attach this document, and compile the formula-driven workbook in
 * one shot. Returns the deterministic review pack (anomalies/errors/summaries)
 * — the number is compiled + recompute-gated, never model-invented.
 */
export async function compileWorkbookAction(
  documentId: number,
  input: {
    clientId: string;
    periodLabel: string;
    template: CompilableTemplate;
    materiality?: number | null;
  },
): Promise<Result<{ engagementId: number; result: CompileResult }>> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  if (!input.clientId) return { ok: false, error: "This document isn't linked to a client yet." };
  if (!input.periodLabel.trim()) return { ok: false, error: "A period label is required." };
  try {
    const eng = await createEngagement({
      clientId: input.clientId,
      periodLabel: input.periodLabel.trim(),
      template: input.template,
      materiality: input.materiality,
    });
    await attachDocumentToEngagement(eng.engagement_id, documentId);
    const result = await compileEngagement(eng.engagement_id);
    revalidatePath(`/admin/analyses/${documentId}`);
    return { ok: true, engagementId: eng.engagement_id, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Compile failed" };
  }
}

/** Recompile an existing engagement (e.g. after corrections) and re-gate it. */
export async function recompileWorkbookAction(
  engagementId: number,
  documentId: number,
): Promise<Result<{ result: CompileResult }>> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  try {
    const result = await compileEngagement(engagementId);
    revalidatePath(`/admin/analyses/${documentId}`);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Compile failed" };
  }
}

/** Spreadsheet AI (Step 2): run one command over the current selection. */
export async function runSelectionCommandAction(input: {
  command: string;
  selectionA1: string;
  sheetName?: string;
  headers?: string[];
  rows?: string[][];
  formulas?: (string | null)[][];
  instruction?: string;
}): Promise<Result<{ result: SelectionResult }>> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  try {
    return { ok: true, result: await assistantSelection(input) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Assistant unavailable" };
  }
}

/**
 * Lightweight poll for the Review page's own live-status banner. The review
 * page previously only rendered a static "Status: X" string with no way to
 * tell whether the pipeline was actually doing anything — this backs a poll
 * loop that shows real progress and, on failure, the actual reason.
 */
export async function getDocumentStatusAction(
  documentId: number
): Promise<Result<{ status: string; reason?: string }>> {
  if (!(await isAdmin())) return { ok: false, error: "Unauthorized" };
  try {
    const doc = await getDocument(documentId);
    const reason = doc.progress?.reason;
    return { ok: true, status: doc.status, reason: typeof reason === "string" ? reason : undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Status check failed" };
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
