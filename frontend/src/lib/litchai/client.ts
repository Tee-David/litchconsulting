import "server-only";
import type { CompilableTemplate } from "./templates";

export type { CompilableTemplate } from "./templates";

/**
 * LitchAI OCI backend client (PRD §12.5).
 *
 * The backend is never publicly exposed; it sits behind a Cloudflare Tunnel and
 * this server-only client authenticates machine-to-machine with a Cloudflare
 * Access **service token** (no interactive login). Only the admin's server
 * actions call it. Uploads go through `blind-relay.ts` (encrypted); everything
 * here is metadata reads + the corrections-only write surface.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — cannot reach LitchAI`);
  return value;
}

async function litchai<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(new URL(path, requireEnv("LITCHAI_API_URL")), {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "CF-Access-Client-Id": requireEnv("LITCHAI_ACCESS_CLIENT_ID"),
      "CF-Access-Client-Secret": requireEnv("LITCHAI_ACCESS_CLIENT_SECRET"),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`LitchAI ${path} → ${res.status} ${await res.text().catch(() => "")}`);
  }
  return (await res.json()) as T;
}

export type LitchaiDocument = {
  document_id: number;
  client_id: string;
  filename: string;
  mime: string;
  status: string;
  progress: Record<string, unknown>;
  created_at: string;
};

export type LineItem = {
  id: number;
  raw_text: string;
  normalized_text: string;
  direction: "in" | "out" | null;
  amount: number;
  sheet_ref: string | null;
  page_ref: number | null;
  category_code: string | null;
  category_source: string | null;
  confidence: number | null;
  flags: string[];
  needs_review: boolean;
};

export type QueueEntry = { line_item_id: number; risk: number; novelty: number };
export type FigureLineage = {
  figure: string;
  item_count: number;
  by_source: Record<string, number>;
  min_confidence: number | null;
  review_worthy: number;
};

export type ReviewData = {
  document: {
    document_id: number;
    status: string;
    filename: string;
    engagement_id: number | null;
    client_id: string;
  };
  line_items: LineItem[];
  queue: QueueEntry[];
  lineage: FigureLineage[];
};

export type Engagement = {
  engagement_id: number;
  client_id: string;
  period_label: string;
  template: string;
  materiality: number | null;
  status: string;
  latest_generated_file_id?: number | null;
};

/** A flagged figure from the deterministic ReviewPack (never model-invented). */
export type Anomaly = {
  severity: "info" | "warning" | "high";
  code: string;
  message: string;
  refs: string[];
  amount: number | null;
};

export type SectionSummary = { label: string; total: number; pct_of_parent: number | null };

/** Result of POST /engagements/{id}/compile. `errors` are [sheet, row, col, token]. */
export type CompileResult = {
  ok: boolean;
  generated_file_id: number | null;
  errors: [string, number, number, string][];
  anomalies: Anomaly[];
  summaries: SectionSummary[];
};

/** One proposed cell edit from the spreadsheet AI (POST /assistant/selection). */
export type SelectionEdit = { cell: string; value: string | null; formula: string | null };
export type SelectionResult = {
  command: string;
  edits: SelectionEdit[];
  explanation: string;
  warnings: string[];
};

/** A confirm-gated WRITE the backend proposes but never executes itself. */
export type AssistantProposal = {
  tool: string;
  action: string;
  params: Record<string, unknown>;
  summary: string;
  ready: boolean;
};

/** Mirrors the backend `ChatResult` (litchai.ai.assistant.answer_chat). */
export type AssistantResponse = {
  answer: string;
  citations: string[];
  tool: string;
  routed_by: string;
  can_answer: boolean;
  tool_result: Record<string, unknown> | null;
  proposal: AssistantProposal | null;
};

/** Per-engagement `/engagements/{id}/ask` response (AI Studio review panel). */
export type EngagementAskResponse = {
  intent: string;
  answer: string | null;
  proposed_correction: { kind: string; target: string; new_value: string } | null;
  grounded_refs: string[];
  needs_review: boolean;
};

export function transitionEngagement(
  engagementId: number,
  action: "submit" | "approve" | "reject" | "lock" | "reopen",
): Promise<{ engagement_id: number; status: string }> {
  return litchai(`/engagements/${engagementId}/${action}`, { method: "POST" });
}

/** Create the engagement a compile hangs off (template must be compilable). */
export function createEngagement(input: {
  clientId: string;
  periodLabel: string;
  template: CompilableTemplate;
  materiality?: number | null;
  auxInputs?: Record<string, unknown> | null;
}): Promise<Engagement> {
  return litchai("/engagements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: input.clientId,
      period_label: input.periodLabel,
      template: input.template,
      materiality: input.materiality ?? null,
      aux_inputs: input.auxInputs ?? null,
    }),
  });
}

export function getEngagement(engagementId: number): Promise<Engagement> {
  return litchai(`/engagements/${engagementId}`);
}

/** Pull an already-ingested document into an engagement so it compiles. */
export function attachDocumentToEngagement(
  engagementId: number,
  documentId: number,
): Promise<{ document_id: number; engagement_id: number | null; status: string }> {
  return litchai(`/engagements/${engagementId}/documents/${documentId}`, { method: "POST" });
}

/** Compile the engagement's workbook: recompute + gate, returns the review pack. */
export function compileEngagement(engagementId: number): Promise<CompileResult> {
  return litchai(`/engagements/${engagementId}/compile`, { method: "POST" });
}

/** Spreadsheet AI: a selection + headers → a structured cell-edit proposal. */
export function assistantSelection(input: {
  command: string;
  selectionA1: string;
  sheetName?: string;
  headers?: string[];
  rows?: string[][];
  formulas?: (string | null)[][];
  instruction?: string;
}): Promise<SelectionResult> {
  return litchai("/assistant/selection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      command: input.command,
      selection_a1: input.selectionA1,
      sheet_name: input.sheetName,
      headers: input.headers ?? [],
      rows: input.rows ?? [],
      formulas: input.formulas ?? null,
      instruction: input.instruction,
    }),
  });
}

export function askEngagement(engagementId: number, question: string): Promise<EngagementAskResponse> {
  return litchai(`/engagements/${engagementId}/ask?question=${encodeURIComponent(question)}`, {
    method: "POST",
  });
}

export type TaxonomyCategory = { code: string; label: string };

export function getTaxonomy(): Promise<{ version: string; categories: TaxonomyCategory[] }> {
  return litchai("/taxonomy");
}

export type Observability = {
  documents_total: number;
  documents_by_status: Record<string, number>;
  documents_rejected: number;
  needs_review_total: number;
  rung_hit_rates: { rung: number; seen: number; accepted: number; hit_rate: number }[];
  rung4_fallback_rate: number;
};

export function getObservability(): Promise<Observability> {
  return litchai("/observability");
}

/**
 * NDPA erasure (backend Phase 6, ops/erasure.py): deletes the client's
 * documents, line items, engagements and client-scoped category memory on the
 * VM. Callers must treat a 404 as "not available yet", never as success.
 */
export function eraseClient(clientId: string): Promise<{ ok: boolean }> {
  return litchai(`/clients/${encodeURIComponent(clientId)}/erase`, { method: "POST" });
}

export function listDocuments(clientId?: string): Promise<{ documents: LitchaiDocument[] }> {
  const qs = clientId ? `?client_id=${encodeURIComponent(clientId)}` : "";
  return litchai(`/documents${qs}`);
}

/** Single-document status/progress — the polling surface for relayed uploads. */
export function getDocument(documentId: number): Promise<{
  document_id: number;
  engagement_id: number | null;
  status: string;
  progress: Record<string, unknown> | null;
  filename: string;
}> {
  return litchai(`/documents/${documentId}`);
}

/**
 * Approved, gate-verified workbook bytes (backend Phase 4 endpoint). Until it
 * lands on the VM this throws with the backend's 404 — callers surface that
 * as "not ready yet".
 */
export async function getResultXlsx(documentId: number): Promise<Buffer> {
  const res = await fetch(new URL(`/documents/${documentId}/result.xlsx`, requireEnv("LITCHAI_API_URL")), {
    headers: {
      "CF-Access-Client-Id": requireEnv("LITCHAI_ACCESS_CLIENT_ID"),
      "CF-Access-Client-Secret": requireEnv("LITCHAI_ACCESS_CLIENT_SECRET"),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? "The compiled workbook isn't available yet — approve the engagement first (or the backend result endpoint hasn't shipped)."
        : `LitchAI result → ${res.status}`
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

export function getReview(documentId: number): Promise<ReviewData> {
  return litchai(`/documents/${documentId}/review`);
}

export function recategorizeLine(
  documentId: number,
  lineItemId: number,
  newCode: string,
): Promise<{ ok: boolean; category_code: string }> {
  const qs = `?new_code=${encodeURIComponent(newCode)}`;
  return litchai(`/documents/${documentId}/lines/${lineItemId}/recategorize${qs}`, {
    method: "POST",
  });
}

export function assistantChat(
  message: string,
  history?: { role: string; content: string }[],
  scope: "firm" | "client" = "firm",
  clientId?: string
): Promise<AssistantResponse> {
  return litchai("/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history, scope, client_id: clientId }),
  });
}

export function reindexKnowledge(): Promise<{ ok: boolean; chunks_indexed: number }> {
  return litchai("/knowledge/reindex", { method: "POST" });
}
