/**
 * How a Sage answer is shown: sources, the key figure, bars, the provenance
 * line, follow-up prompts and starters. Pure functions over the engine's
 * contract (`citations` / `tool` / `tool_result` / `proposal` / `engine`),
 * shared by the Sage page, the chat widget and (later) the workbench panel.
 * Isomorphic: no server-only imports.
 */

import { answeredBy } from "@/lib/ai-words";
import type { FailureKind } from "@/lib/ai-words";

export type SageRole = "admin" | "staff";

/** Mirrors `AssistantProposal` in lib/litchai/client.ts (type copy: that file is server-only). */
export type SageProposal = {
  tool: string;
  action: string;
  params: Record<string, unknown>;
  summary: string;
  ready: boolean;
};

export type SageEngine = { provider: string; model: string; kind: "cloud" | "local"; masked: boolean } | null;

export type ProposalState = "pending" | "confirmed" | "dismissed" | "blocked";

/** What we keep with an assistant turn (sage_message.meta) so a reopened thread looks the same. */
export type SageMessageMeta = {
  tool?: string;
  toolResult?: Record<string, unknown> | null;
  proposal?: SageProposal | null;
  proposalState?: ProposalState | null;
  engine?: SageEngine;
  routedBy?: string;
  seconds?: number;
  canAnswer?: boolean;
};

export type SageTurn = {
  id: string;
  /** The saved sage_message id (assistant turns), once known. */
  savedId?: string;
  role: "user" | "assistant";
  content: string;
  at?: string;
  citations?: string[];
  tool?: string;
  toolResult?: Record<string, unknown> | null;
  proposal?: SageProposal | null;
  proposalState?: ProposalState | null;
  engine?: SageEngine;
  routedBy?: string;
  seconds?: number;
  canAnswer?: boolean;
  failure?: FailureKind | null;
  retryText?: string;
  /** Staff answer held back: the engine did not confirm it applied the staff scope. */
  held?: boolean;
  fresh?: boolean;
};

/* ------------------------------------------------------------------ sources */

export type SageSource = {
  n: number;
  title: string;
  detail?: string;
  href?: string;
  kind: "records" | "knowledge";
};

/** Where each app read lives in the product (the record behind the figures). */
const APP_READS: Record<string, { title: string; href: string; staffHref?: string }> = {
  billing_status: { title: "Billing records", href: "/admin/billing" },
  request_work: { title: "Request records", href: "/admin/requests", staffHref: "/work/requests" },
  client_privacy: { title: "Client privacy records", href: "/admin/clients" },
  backup_status: { title: "Backup records", href: "/admin/settings/backups" },
};

const ENGINE_READS: Record<string, string> = {
  list_analyses: "Analysis server documents",
  document_status: "Analysis server document",
  pipeline_health: "Analysis server pipeline",
  workbench_status: "Workbench records",
};

/**
 * Numbered sources for the margin. The live record behind the figures comes
 * first (it carries the amounts), then the knowledge-base sections. The engine
 * cites per answer, not per sentence, so the ticks mark the whole answer.
 */
export function sourcesFor(turn: Pick<SageTurn, "citations" | "tool" | "toolResult">, role: SageRole = "admin"): SageSource[] {
  const out: SageSource[] = [];
  const data = turn.toolResult;
  if (data && turn.tool && !("error" in data && Object.keys(data).length === 1)) {
    const app = APP_READS[turn.tool];
    const where = typeof data.where === "string" ? data.where : undefined;
    if (app) {
      out.push({
        n: 0,
        kind: "records",
        title: app.title,
        detail: where ? `Live data · ${where}` : "Live data",
        href: role === "staff" ? app.staffHref : app.href,
      });
    } else if (ENGINE_READS[turn.tool]) {
      out.push({ n: 0, kind: "records", title: ENGINE_READS[turn.tool], detail: "Live data", href: role === "admin" ? "/admin/analyses" : "/work/analyses" });
    }
  }
  for (const c of turn.citations ?? []) {
    const [title, ...rest] = c.split(" — ");
    out.push({ n: 0, kind: "knowledge", title: title.trim() || c, detail: rest.length ? `Knowledge base · ${rest.join(" — ")}` : "Knowledge base" });
  }
  return out.map((s, i) => ({ ...s, n: i + 1 }));
}

/* ------------------------------------------------------------- key figures */

const naira = (n: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(n || 0);
const count = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : null);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-NG")} ${n === 1 ? one : many}`;
const day = (iso: unknown) =>
  typeof iso === "string" && iso
    ? new Date(iso).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric" })
    : null;

export type KeyFigure = { label: string; value: string; sub?: string; tone?: "bad" | "good" | "warn" };

/** The one number an answer opens with, when the data has one. */
export function keyFigureFor(tool: string | undefined, data: Record<string, unknown> | null | undefined): KeyFigure | null {
  if (!tool || !data || "error" in data) return null;
  if (tool === "billing_status") {
    const overdue = count(data.overdue_count) ?? 0;
    const unpaid = count(data.unpaid_invoices_count) ?? 0;
    if (overdue > 0) {
      return {
        label: "Overdue balance",
        value: naira(Number(data.overdue_total) || 0),
        sub: `${plural(overdue, "invoice")} past due · ${plural(unpaid, "invoice")} unpaid in all`,
        tone: "bad",
      };
    }
    return { label: "Owed to the firm", value: naira(Number(data.total_owed) || 0), sub: `${plural(unpaid, "unpaid invoice")} · none past due` };
  }
  if (tool === "request_work") {
    if (typeof data.request === "string") {
      const asks = Array.isArray(data.open_asks) ? data.open_asks.length : 0;
      return { label: String(data.service ?? "Request"), value: String(data.request), sub: `${String(data.status ?? "").replace(/_/g, " ")} · ${plural(asks, "open ask")}` };
    }
    const active = count(data.active_count);
    if (active === null) return null;
    return {
      label: "Active requests",
      value: active.toLocaleString("en-NG"),
      sub: `${plural(count(data.waiting_on_client_count) ?? 0, "request")} waiting on the client · ${(count(data.unassigned_count) ?? 0).toLocaleString("en-NG")} unassigned`,
    };
  }
  if (tool === "backup_status") {
    const at = day(data.last_backup_at);
    const test = data.last_restore_test as { passed?: boolean } | null | undefined;
    return {
      label: "Last backup",
      value: at ?? "None yet",
      sub: `${plural(count(data.backups_kept) ?? 0, "backup")} kept · restore test ${test ? (test.passed ? "passed" : "failed") : "not run"}`,
      tone: !at || (test && !test.passed) ? "warn" : undefined,
    };
  }
  if (tool === "list_analyses") {
    const n = count(data.count) ?? (Array.isArray(data.documents) ? data.documents.length : null);
    return n === null ? null : { label: "Documents on the analysis server", value: n.toLocaleString("en-NG") };
  }
  if (tool === "client_privacy" && Array.isArray(data.erasure_pending)) {
    return {
      label: "Erasures waiting",
      value: data.erasure_pending.length.toLocaleString("en-NG"),
      sub: `${plural(Array.isArray(data.local_only_clients) ? data.local_only_clients.length : 0, "client")} on the private local model`,
    };
  }
  return null;
}

/* -------------------------------------------------------------------- bars */

export type BarRow = { label: string; value: number; display: string; tone: "bad" | "base" };
export type Bars = { title: string; rows: BarRow[]; legend?: { bad: string; base: string }; link?: { label: string; href: string } };

/** A small ranked bar list inside the answer, when the data is a ranking. */
export function barsFor(tool: string | undefined, data: Record<string, unknown> | null | undefined): Bars | null {
  if (!tool || !data || "error" in data) return null;
  if (tool === "billing_status" && Array.isArray(data.overdue_invoices) && data.overdue_invoices.length > 1) {
    const rows = (data.overdue_invoices as { client?: string; number?: string; balance?: number }[])
      .map((r) => ({ label: `${r.client ?? "Client"} · ${r.number ?? ""}`.trim(), value: Number(r.balance) || 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
      .map((r) => ({ ...r, display: naira(r.value), tone: "bad" as const }));
    return { title: "Largest overdue balances", rows, link: { label: "Open invoices", href: "/admin/billing/invoices" } };
  }
  if (tool === "request_work" && Array.isArray(data.waiting_on_client) && data.waiting_on_client.length > 1) {
    const rows = (data.waiting_on_client as { request?: string; status?: string; open_asks?: number }[])
      .filter((r) => (r.open_asks ?? 0) > 0)
      .sort((a, b) => (b.open_asks ?? 0) - (a.open_asks ?? 0))
      .slice(0, 5)
      .map((r) => ({ label: `${r.request ?? ""} · ${String(r.status ?? "").replace(/_/g, " ")}`, value: r.open_asks ?? 0, display: plural(r.open_asks ?? 0, "open ask"), tone: "base" as const }));
    return rows.length > 1 ? { title: "Open asks per request, waiting on the client", rows } : null;
  }
  return null;
}

/* -------------------------------------------------------------- provenance */

export type ProvenanceFact = { kind: "books" | "knowledge" | "route" | "model" | "rules" | "masked"; text: string };

/** "How this answer was made", from the attribution the engine returns. */
export function provenanceFor(turn: Pick<SageTurn, "tool" | "toolResult" | "citations" | "routedBy" | "engine" | "proposal">): ProvenanceFact[] {
  const out: ProvenanceFact[] = [];
  if (turn.toolResult && turn.tool) {
    out.push({ kind: "books", text: turn.tool === "billing_status" ? "Amounts from your books" : "Facts from your records" });
  }
  const n = turn.citations?.length ?? 0;
  if (n) out.push({ kind: "knowledge", text: `Grounded in ${plural(n, "knowledge source")}` });
  if (turn.routedBy === "semantic") out.push({ kind: "route", text: "Routed by the decision layer" });
  else if (turn.routedBy === "llm") out.push({ kind: "route", text: "Routed by the model" });
  if (turn.engine) {
    const who = answeredBy(turn.engine.provider, turn.engine.model, turn.engine.kind).replace(/^Answered by /, "");
    out.push({ kind: "model", text: `Wording by ${who || "the model"}` });
    if (turn.engine.masked) out.push({ kind: "masked", text: "Names masked before the model" });
  } else if (turn.proposal || turn.tool) {
    out.push({ kind: "rules", text: "Fixed wording, no model" });
  }
  return out;
}

/* ----------------------------------------------------------------- prompts */

export const STARTERS: Record<SageRole, { label: string; prompt: string }[]> = {
  admin: [
    { label: "Who owes us money that is late?", prompt: "Who owes us money that is late?" },
    { label: "What waits on the client?", prompt: "Which requests are waiting on the client?" },
    { label: "Payments to confirm", prompt: "Which bank transfers are waiting for me to confirm?" },
    { label: "VAT on professional services", prompt: "What VAT rate applies to professional services under the NTA 2025?" },
  ],
  staff: [
    { label: "What is waiting on me?", prompt: "What is waiting on me?" },
    { label: "Which of my requests are due this week?", prompt: "Which of my requests are due this week?" },
    { label: "What does the client still owe me in documents?", prompt: "Which of my requests wait on documents from the client?" },
    { label: "WHT on rent", prompt: "What is the WHT rate on rent under the NTA 2025?" },
  ],
};

/** Follow-up chips above the composer, from what the last answer was about. */
export function followUpsFor(tool: string | undefined, role: SageRole): string[] {
  if (role === "staff") {
    if (tool === "request_work") return ["Which asks are still open?", "Which of my requests are due this week?", "What did the client send last?"];
    return ["What is waiting on me?", "Explain WHT on rent", "Which of my requests are due this week?"];
  }
  switch (tool) {
    case "billing_status":
      return ["Show every late invoice", "What came in over the last 30 days?", "Which transfers wait for me to confirm?"];
    case "request_work":
      return ["Which requests have no one assigned?", "Which requests wait on the client?"];
    case "backup_status":
      return ["When did the restore test last pass?", "How many backups are kept?"];
    case "client_privacy":
      return ["Which clients use the private local model?", "Which erasures are due?"];
    default:
      return ["Who owes us money that is late?", "Which requests wait on the client?", "What is the CIT rate for a small company?"];
  }
}

/* --------------------------------------------------------------- proposals */

const MONEY = /invoice|payment|quote|billing|reminder|refund|receipt|expense|amount/i;

/** True when a proposal touches money (invoices, payments, quotes, reminders). */
export function isMoneyProposal(p: Pick<SageProposal, "tool" | "action" | "params">): boolean {
  return MONEY.test(p.tool) || MONEY.test(p.action) || p.action === "create_billing_draft" || "amount" in (p.params ?? {});
}

/** Params a person may change before confirming (plain text and amounts only). */
export const EDITABLE_PARAMS = ["client_name", "description", "amount", "to", "subject", "body"] as const;

/** A proposal that sends something carries a letter preview (to, subject, body). */
export function letterOf(p: SageProposal): { to: string; subject: string; body: string } | null {
  const { to, subject, body } = p.params ?? {};
  if (typeof to === "string" && typeof subject === "string" && typeof body === "string") return { to, subject, body };
  return null;
}

export function paramLabel(key: string): string {
  const map: Record<string, string> = { client_name: "Client", description: "Description", amount: "Amount (₦)", to: "To", subject: "Subject", body: "Message" };
  return map[key] ?? key.replace(/_/g, " ");
}

/* -------------------------------------------------------------------- misc */

/** Conversation rail groups: "Waiting for you", "This week", then by month. */
export function railGroup(updatedAt: Date | string, pending: boolean, now = new Date()): string {
  if (pending) return "Waiting for you";
  const d = new Date(updatedAt);
  const age = now.getTime() - d.getTime();
  if (age < 7 * 86_400_000) return "This week";
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", month: "long", ...(sameYear ? {} : { year: "numeric" }) });
}

export function shortWhen(iso: Date | string | null | undefined, now = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  const tz = "Africa/Lagos";
  const key = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: tz });
  if (key(d) === key(now)) return d.toLocaleTimeString("en-NG", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const y = new Date(now.getTime() - 86_400_000);
  if (key(d) === key(y)) return "Yesterday";
  if (now.getTime() - d.getTime() < 6 * 86_400_000) return d.toLocaleDateString("en-NG", { timeZone: tz, weekday: "short" });
  return d.toLocaleDateString("en-NG", { timeZone: tz, day: "numeric", month: "short" });
}
