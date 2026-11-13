import "server-only";
import { litchaiRaw } from "./client";

/**
 * Server-only transport for the co-pilot workbench (LitchAI /workbench/*).
 * The browser never calls LitchAI: it calls our route handlers and server
 * actions, which check access (canWorkOnRequest) and then come through here.
 */

export type WbGate = {
  status: "passed" | "blocked" | "unverified" | "conflict";
  errors: string[];
  formulas?: number;
  engine?: string;
  detail?: string | null;
  workbooks?: Record<string, WbGate>;
};

export type WbOp = {
  op: "set_cell" | "create_sheet" | "delete_sheet" | "create_workbook" | "add_chart" | "remove_chart";
  workbook_id: string;
  sheet: string | null;
  cell: string | null;
  old_value: unknown;
  old_formula: string | null;
  new_value: unknown;
  new_formula: string | null;
  reason: string;
  tool: string;
  source_rows: string[];
  preview_value: unknown;
  chart: Record<string, unknown> | null;
  kind: "new" | "changed" | null;
};

export type WbBatch = {
  id: string;
  title: string;
  summary: string;
  tool: string;
  status: "pending" | "accepted" | "rejected" | "blocked" | "undone";
  created_at: string;
  decided_at: string | null;
  gate: WbGate | null;
  inverse_of: string | null;
  step: number | null;
  counts: { new_cells: number; changed_cells: number; new_sheets: number; charts: number; ops: number };
  ops: WbOp[];
  risk?: "safe" | "risky";
  risk_reasons?: string[];
};

export type WbVersion = { n: number; sha: string; at: string; batch_id: string | null; gate: WbGate | null };
export type WbWorkbookRef = {
  id: string;
  name: string;
  origin: string;
  document_id: number | null;
  versions: WbVersion[];
  source?: { filename: string; format: string; converted: boolean; notes: string[] } | null;
};

/** One harness event (SSE frame). `type` drives the UI. */
export type WbEvent = { type: string; [k: string]: unknown };

export type WbMessage = {
  role: "user" | "assistant";
  content: string;
  at: string;
  selection?: string | null;
  citations?: string[];
  proposals?: string[];
  attribution?: { pipeline: string[]; model: string | null; decision: string } | null;
  /** Figures in the answer that no tool result backs (grounding rule). */
  unverified_figures?: string[];
  steps?: WbEvent[];
};

export type WbConversation = {
  id: string;
  client_id: string | null;
  ai_mode: "cloud_masked" | "local_only";
  title: string;
  client_name: string;
  period_label: string;
  provider: string | null;
  created_at: string;
  updated_at: string;
  workbooks: WbWorkbookRef[];
  batches: WbBatch[];
  messages: WbMessage[];
  pending: number;
};

export type WbColumnProfile = { letter: string; name: string; role?: string; [k: string]: unknown };
export type WbSheetProfile = {
  sheet: string;
  max_row: number;
  max_col: number;
  table: { range: string; rows: number; columns?: WbColumnProfile[] } | null;
  columns?: WbColumnProfile[];
  [k: string]: unknown;
};
export type WbProfile = { workbook_id: string; name: string; origin?: string; sheet_names: string[]; sheets: WbSheetProfile[] };
export type WbFinding = { kind: string; severity: string; cell: string; row: number; message: string };
export type WbFirstLook = {
  workbooks: WbProfile[];
  anomalies: { count: number; by_kind: Record<string, number>; findings: WbFinding[] };
  suggestions: string[];
  /** Files that became an xlsx working copy (the original is kept and cited). */
  conversions?: WbConversion[];
};

export type WbConversion = { workbook_id: string; filename: string; format: string; converted: boolean; notes: string[] };

export type WbCell = {
  ref: string;
  r: number;
  c: number;
  v: string | number | boolean | null;
  f: string | null;
  nf: string | null;
  page: number | null;
  pending: {
    batch_id: string;
    kind: "new" | "changed" | null;
    reason: string;
    tool: string;
    source_rows: string[];
    old_value: unknown;
    old_formula: string | null;
  } | null;
};
export type WbSheetWindow = { sheet: string; max_row: number; max_col: number; sheets: string[]; cells: WbCell[] };

export type WbProvider = {
  name: string;
  kind: "cloud" | "local";
  model: string;
  configured: boolean;
  zero_retention?: boolean;
  ok: boolean | null;
  detail: string;
  used_requests: number;
  used_tokens: number;
  daily_requests: number | null;
  daily_tokens: number | null;
  exhausted_until: string | null;
};

export class WorkbenchError extends Error {
  constructor(message: string, readonly status: number, readonly detail?: unknown) {
    super(message);
  }
}

const enc = encodeURIComponent;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await litchaiRaw(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body && typeof body === "object" && "detail" in body ? (body as { detail: unknown }).detail : body;
    const msg =
      typeof detail === "string" ? detail
      : detail && typeof detail === "object" && "message" in detail ? String((detail as { message: unknown }).message)
      : `The analysis server answered ${res.status}.`;
    throw new WorkbenchError(msg, res.status, detail);
  }
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function wbStart(body: {
  client_id: string | null;
  document_ids: number[];
  ai_mode: "cloud_masked" | "local_only";
  client_name: string;
  period_label?: string;
  title: string;
  blank_workbook?: string | null;
}) {
  return call<{ conversation: WbConversation; first_look: WbFirstLook }>("/workbench/conversations", json(body));
}

export const wbGet = (id: string) => call<{ conversation: WbConversation }>(`/workbench/conversations/${enc(id)}`);

export const wbPatch = (id: string, body: { ai_mode?: string; title?: string }) =>
  call<{ conversation: WbConversation }>(`/workbench/conversations/${enc(id)}`, { ...json(body), method: "PATCH" });

export const wbFirstLook = (id: string) => call<WbFirstLook>(`/workbench/conversations/${enc(id)}/first-look`);

export const wbAttach = (id: string, documentIds: number[]) =>
  call<{ conversation: WbConversation; first_look: WbFirstLook }>(`/workbench/conversations/${enc(id)}/documents`, json({ document_ids: documentIds }));

export const wbDecide = (id: string, batchId: string, action: "accept" | "reject" | "undo", edits?: Record<number, { new_value?: unknown; new_formula?: string }>) =>
  call<{ batch: WbBatch; conversation: WbConversation }>(
    `/workbench/conversations/${enc(id)}/batches/${enc(batchId)}/${action}`,
    json(action === "accept" ? { edits: edits ?? null } : {}),
  );

/** Workbenches that hold one document, newest first (to resume instead of starting again). */
export const wbListByDocument = (documentId: number) =>
  call<{ conversations: { id: string; updated_at?: string }[] }>(`/workbench/conversations?document_id=${documentId}&limit=20`);

/** A person's own edits (E2): saved at once as a version named after them. */
export type WbUserEdit = { sheet: string; cell: string; value?: string | number | boolean | null; formula?: string; clear?: boolean; number_format?: string };
export const wbUserEdits = (id: string, workbookId: string, author: string, edits: WbUserEdit[]) =>
  call<{ batch: WbBatch; conversation: WbConversation }>(`/workbench/conversations/${enc(id)}/edits`, json({ workbook_id: workbookId, author, edits }));

export const wbRunTool = (id: string, tool: string, args: Record<string, unknown>) =>
  call<{ data: Record<string, unknown>; summary: string; citations: string[]; batch: WbBatch | null; chart_preview?: Record<string, unknown> | null }>(
    `/workbench/conversations/${enc(id)}/tools/${enc(tool)}`,
    json({ args }),
  );

export const wbSheet = (id: string, wbId: string, sheet: string, r0: number, r1: number, c0 = 1, c1 = 60) =>
  call<WbSheetWindow>(
    `/workbench/conversations/${enc(id)}/workbooks/${enc(wbId)}/sheets/${enc(sheet)}?r0=${r0}&r1=${r1}&c0=${c0}&c1=${c1}`,
  );

export const wbChartPreview = (id: string, spec: Record<string, unknown>, workbookId?: string) =>
  call<Record<string, unknown>>(`/workbench/conversations/${enc(id)}/charts/preview`, json({ spec, workbook_id: workbookId ?? null }));

export const wbProviders = (probe = false) =>
  call<{ chain: WbProvider[]; local_only_chain: string[] }>(`/ai/providers${probe ? "?probe=true" : ""}`);

/** The agent turn as the backend's SSE stream (piped to the browser as is). */
export function wbStream(id: string, body: { message: string; selection?: string | null }, signal?: AbortSignal) {
  return litchaiRaw(`/workbench/conversations/${enc(id)}/messages`, { ...json(body), signal });
}

/** A workbook file. `verified` runs the recompute gate first (final actions). */
export async function wbDownload(id: string, wbId: string, opts: { verified?: boolean; version?: number } = {}) {
  const path = opts.verified
    ? `/workbench/conversations/${enc(id)}/workbooks/${enc(wbId)}/verified.xlsx`
    : `/workbench/conversations/${enc(id)}/workbooks/${enc(wbId)}.xlsx${opts.version ? `?version=${opts.version}` : ""}`;
  const res = await litchaiRaw(path);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    throw new WorkbenchError(
      res.status === 409 ? "The recompute gate found formula errors, so nothing was released." : `Download failed (${res.status}).`,
      res.status,
      detail,
    );
  }
  return {
    bytes: Buffer.from(await res.arrayBuffer()),
    gate: {
      status: (res.headers.get("x-gate-status") ?? "unverified") as WbGate["status"],
      formulas: Number(res.headers.get("x-gate-formulas") ?? 0),
      detail: res.headers.get("x-gate-detail") || null,
      errors: [] as string[],
    },
  };
}
