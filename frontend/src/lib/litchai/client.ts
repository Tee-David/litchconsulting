import "server-only";

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
  document: { document_id: number; status: string; filename: string; engagement_id: number | null };
  line_items: LineItem[];
  queue: QueueEntry[];
  lineage: FigureLineage[];
};

export type AssistantResponse = {
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

export function askEngagement(engagementId: number, question: string): Promise<AssistantResponse> {
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

export function listDocuments(clientId?: string): Promise<{ documents: LitchaiDocument[] }> {
  const qs = clientId ? `?client_id=${encodeURIComponent(clientId)}` : "";
  return litchai(`/documents${qs}`);
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
