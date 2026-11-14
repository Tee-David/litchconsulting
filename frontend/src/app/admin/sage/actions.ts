"use server";

import { and, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { client, sageConversation, sageMessage, type SageConversation, type SageMessage } from "@/lib/db/schema";
import taxConfig from "@/lib/tax/nigeria-tax-config.json";
import { sageRole } from "@/lib/sage/caller";
import { isMoneyProposal, type SageMessageMeta, type ProposalState } from "@/lib/sage/present";
import { recordAudit } from "@/lib/audit";
import { listSageConversations, getSageConversation, getSageMessages } from "@/lib/db/queries/sage";
import {
  recategorizeLine,
  transitionEngagement,
  type AssistantProposal,
} from "@/lib/litchai/client";

export type ProposalResult = { ok: boolean; message: string };

/** Admins and staff (the "sage" area). Threads are per user for both. */
async function me(): Promise<{ userId: string; role: "admin" | "staff" } | null> {
  return sageRole();
}

function revalidateSage() {
  revalidatePath("/admin/sage");
  revalidatePath("/work/sage");
}

/** Record a proposal's state on its saved message (owner-checked). */
async function setProposalState(userId: string, messageId: string | undefined, state: ProposalState) {
  if (!messageId || !/^[0-9a-f-]{36}$/i.test(messageId)) return;
  const [row] = await db
    .select({ id: sageMessage.id, meta: sageMessage.meta })
    .from(sageMessage)
    .innerJoin(sageConversation, eq(sageConversation.id, sageMessage.conversationId))
    .where(and(eq(sageMessage.id, messageId), eq(sageConversation.userId, userId)))
    .limit(1);
  if (!row) return;
  const meta = { ...((row.meta ?? {}) as SageMessageMeta), proposalState: state };
  await db.update(sageMessage).set({ meta }).where(eq(sageMessage.id, messageId));
}

const ENGAGEMENT_ACTIONS = new Set(["submit", "approve", "reject", "lock", "reopen"]);

/**
 * Apply a Sage WRITE proposal — the backend only ever *proposes* these; a
 * human confirms here, then we dispatch to the matching LitchAI endpoint.
 * Admins only: a staff dispatch is refused on the server and audit-logged
 * (staff never confirm money, and this version has no staff write that is
 * scoped to an assigned request). Every applied proposal is audit-logged.
 */
export async function applyAssistantProposalAction(
  proposal: AssistantProposal,
  messageId?: string,
): Promise<ProposalResult> {
  const who = await me();
  if (!who) return { ok: false, message: "Not authorized." };
  if (who.role !== "admin") {
    await recordAudit({
      action: "sage.proposal_refused",
      entity: "sage",
      entityId: messageId ?? null,
      meta: { role: who.role, action: String(proposal?.action ?? ""), money: proposal ? isMoneyProposal(proposal) : null },
    });
    await setProposalState(who.userId, messageId, "blocked");
    return { ok: false, message: "Only an admin can do this." };
  }
  if (!proposal?.ready) {
    return { ok: false, message: "That proposal is missing details. Rephrase your request." };
  }

  const done = async (r: ProposalResult) => {
    if (r.ok) {
      await setProposalState(who.userId, messageId, "confirmed");
      revalidateSage();
    }
    return r;
  };

  try {
    if (proposal.action === "engagement_transition") {
      const id = Number(proposal.params.engagement_id);
      const action = String(proposal.params.action);
      if (!id || !ENGAGEMENT_ACTIONS.has(action)) {
        return { ok: false, message: "Invalid engagement action." };
      }
      const res = await transitionEngagement(id, action as never);
      await recordAudit({
        action: `engagement.${action}`,
        entity: "engagement",
        entityId: String(id),
        meta: { via: "sage", status: res.status },
      });
      return done({ ok: true, message: `Engagement ${id} → ${res.status}.` });
    }

    if (proposal.action === "recategorize") {
      const docId = Number(proposal.params.document_id);
      const lineId = Number(proposal.params.line_item_id);
      const code = String(proposal.params.category_code);
      if (!docId || !lineId || !code) {
        return { ok: false, message: "Invalid recategorization." };
      }
      const res = await recategorizeLine(docId, lineId, code);
      await recordAudit({
        action: "line.recategorize",
        entity: "document",
        entityId: String(docId),
        meta: { via: "sage", lineItemId: lineId, categoryCode: res.category_code },
      });
      return done({ ok: true, message: `Line ${lineId} reclassified to ${res.category_code}.` });
    }

    if (proposal.action === "create_billing_draft") {
      return done(await createBillingDraft(proposal.params));
    }

    return { ok: false, message: `Don't know how to apply "${proposal.action}".` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to apply the proposal.",
    };
  }
}

/**
 * Sage's "create a quote / an invoice for X" proposal, after the admin confirms:
 * find the client by name, then save a DRAFT through the normal billing action
 * (admin-guarded, totals recomputed on the server). Nothing is sent: the admin
 * opens the draft in Billing, checks it and sends it.
 */
async function createBillingDraft(params: Record<string, unknown>): Promise<ProposalResult> {
  const kind = params.kind === "quote" ? "quote" : "invoice";
  const name = String(params.client_name ?? "").trim();
  const amount = Number(params.amount);
  if (!name || !Number.isFinite(amount) || amount <= 0 || amount > 1e12) {
    return { ok: false, message: "That proposal needs a client name and an amount. Rephrase your request." };
  }
  const like = `%${name.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const matches = await db
    .select({ id: client.id, name: client.name, company: client.company, email: client.email, address: client.address, taxId: client.taxId })
    .from(client)
    .where(and(isNull(client.deletedAt), isNull(client.erasedAt), or(ilike(client.company, like), ilike(client.name, like))))
    .limit(5);
  if (matches.length === 0) {
    return { ok: false, message: `No client matches "${name}". Add the client first, or use the exact name.` };
  }
  if (matches.length > 1) {
    const list = matches.map((c) => c.company || c.name).join(", ");
    return { ok: false, message: `More than one client matches "${name}" (${list}). Use the full name.` };
  }
  const c = matches[0];
  const { nextInvoiceNumber } = await import("@/lib/db/queries/invoices");
  const { saveInvoiceAction } = await import("@/app/admin/billing/invoices/actions");
  const description = String(params.description ?? "").trim() || (kind === "quote" ? "Professional services (quote)" : "Professional services");
  const res = await saveInvoiceAction({
    kind,
    number: await nextInvoiceNumber(kind),
    status: "draft",
    clientId: c.id,
    billTo: { name: c.name || undefined, company: c.company || undefined, email: c.email || undefined, address: c.address || undefined, taxId: c.taxId || undefined },
    projectTitle: description,
    currency: "NGN",
    issueDate: new Date().toISOString().slice(0, 10),
    items: [{ description, quantity: 1, unitPrice: amount, taxRate: taxConfig.vat.standardRatePct }],
  });
  if (!res.ok || !res.id) return { ok: false, message: res.error || `The draft ${kind} was not saved.` };
  await recordAudit({
    action: `${kind}.drafted`,
    entity: "invoice",
    entityId: res.id,
    meta: { via: "sage", client: c.company || c.name, amount },
  });
  revalidatePath("/admin/billing");
  return { ok: true, message: `Draft ${kind} saved for ${c.company || c.name}. Open Billing to check it and send it.` };
}

/** Dismiss a proposal: nothing is sent; the thread stops waiting for you. */
/** A1/H1: Good or Bad on one of your own Sage answers, with an optional note. Stored on
 *  the message beside the tool and route, so routing mistakes can be counted. */
export async function voteSageMessageAction(messageId: string, vote: "good" | "bad" | null, note?: string): Promise<ProposalResult> {
  const who = await me();
  if (!who) return { ok: false, message: "Not authorized." };
  if (!/^[0-9a-f-]{36}$/i.test(messageId) || (vote !== null && vote !== "good" && vote !== "bad")) return { ok: false, message: "That vote is not valid." };
  const [row] = await db
    .select({ id: sageMessage.id, meta: sageMessage.meta })
    .from(sageMessage)
    .innerJoin(sageConversation, eq(sageConversation.id, sageMessage.conversationId))
    .where(and(eq(sageMessage.id, messageId), eq(sageConversation.userId, who.userId)))
    .limit(1);
  if (!row) return { ok: false, message: "That answer was not found." };
  const meta = {
    ...((row.meta ?? {}) as SageMessageMeta),
    feedback: vote ? { vote, note: (note ?? "").slice(0, 1000) || undefined, at: new Date().toISOString() } : null,
  };
  await db.update(sageMessage).set({ meta }).where(eq(sageMessage.id, messageId));
  return { ok: true, message: vote === "good" ? "Thanks. Marked as a good answer." : vote === "bad" ? "Thanks. Your note was saved with how Sage answered." : "Vote removed." };
}

export async function dismissSageProposalAction(messageId: string): Promise<ProposalResult> {
  const who = await me();
  if (!who) return { ok: false, message: "Not authorized." };
  await setProposalState(who.userId, messageId, "dismissed");
  revalidateSage();
  return { ok: true, message: "Dismissed. Nothing was sent." };
}

/* -------------------------------------------------------------------------- *
 * Conversation history — persisted per admin user so a chat survives a
 * refresh and is searchable (title + message content).
 * -------------------------------------------------------------------------- */

function deriveTitle(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return "New conversation";
  if (clean.length <= 60) return clean;
  return `${clean.slice(0, 60).replace(/\s+\S*$/, "")}…`;
}

// A greeting / filler opener carries no topic — keep the title provisional and
// upgrade it to the first *substantive* message (how ChatGPT/Claude name a chat).
const TRIVIAL_OPENER =
  /^(hi|hey+|hello|yo|sup|hiya|howdy|gm|good (morning|afternoon|evening|day)|thanks?|thank (you|u)|ok(ay)?|great|cool|nice|test|ping)\b[\s!.?]*$/i;

function isTrivial(text: string): boolean {
  const c = text.trim();
  return c.length < 12 || TRIVIAL_OPENER.test(c);
}

export type RailConversation = SageConversation & { pending: number };

export async function listSageConversationsAction(
  search?: string,
): Promise<{ ok: boolean; conversations: RailConversation[] }> {
  const who = await me();
  if (!who) return { ok: false, conversations: [] };
  const list = await listSageConversations(who.userId, { search });
  const pending = await pendingCounts(list.map((c) => c.id));
  return { ok: true, conversations: list.map((c) => ({ ...c, pending: pending.get(c.id) ?? 0 })) };
}

/** Proposals still waiting for a confirm, per conversation. */
async function pendingCounts(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  try {
    const rows = await db
      .select({ id: sageMessage.conversationId, n: sql<number>`count(*)` })
      .from(sageMessage)
      .where(and(inArray(sageMessage.conversationId, ids), sql`${sageMessage.meta}->>'proposalState' = 'pending'`))
      .groupBy(sageMessage.conversationId);
    return new Map(rows.map((r) => [r.id, Number(r.n)]));
  } catch {
    return new Map();
  }
}

export async function loadSageConversationAction(
  id: string,
): Promise<{ ok: boolean; conversation?: SageConversation; messages?: SageMessage[]; error?: string }> {
  const who = await me();
  if (!who) return { ok: false, error: "Not authorized." };
  const conversation = await getSageConversation(id, who.userId);
  if (!conversation) return { ok: false, error: "Conversation not found." };
  return { ok: true, conversation, messages: await getSageMessages(id) };
}

export type BeginTurnInput = {
  conversationId?: string | null;
  scope: "firm" | "client";
  clientId?: string | null;
  userMessage: string;
};
export type BeginTurnResult =
  | { ok: true; conversationId: string; title: string }
  | { ok: false; error: string };

/** Persist the USER message immediately when a turn is sent — creating the
 *  conversation on the first message. Because this runs *before* the model
 *  replies, the question survives even if the reply is slow, gets cut off, or
 *  the admin navigates away mid-response. Also upgrades a provisional title
 *  (from a greeting) to the first substantive message. */
export async function beginSageTurnAction(input: BeginTurnInput): Promise<BeginTurnResult> {
  const who = await me();
  if (!who) return { ok: false, error: "Not authorized." };
  const userId = who.userId;
  // Staff threads are firm scope only (no single-client context).
  if (who.role !== "admin") input = { ...input, scope: "firm", clientId: null };

  try {
    let conversationId = input.conversationId || null;
    let title: string;

    if (conversationId) {
      const [existing] = await db
        .select({ id: sageConversation.id, title: sageConversation.title })
        .from(sageConversation)
        .where(and(eq(sageConversation.id, conversationId), eq(sageConversation.userId, userId)));
      if (!existing) return { ok: false, error: "Conversation not found." };
      title = existing.title;
      // Auto-rename: a chat opened with "hi" gets its name from the first real
      // question the admin asks, mirroring ChatGPT/Claude.
      const set: { updatedAt: Date; title?: string } = { updatedAt: new Date() };
      if (isTrivial(title) && !isTrivial(input.userMessage)) {
        title = deriveTitle(input.userMessage);
        set.title = title;
      }
      await db.update(sageConversation).set(set).where(eq(sageConversation.id, conversationId));
    } else {
      title = deriveTitle(input.userMessage);
      const [row] = await db
        .insert(sageConversation)
        .values({
          userId,
          title,
          scope: input.scope,
          clientId: input.scope === "client" ? input.clientId || null : null,
        })
        .returning({ id: sageConversation.id });
      conversationId = row.id;
    }

    await db.insert(sageMessage).values({ conversationId, role: "user", content: input.userMessage.slice(0, 3000) });
    revalidateSage();
    return { ok: true, conversationId, title };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the conversation." };
  }
}

/** Append the assistant reply once it lands. Best-effort follow-up to
 *  `beginSageTurnAction`; a failure here never blocks the on-screen answer. */
export async function finishSageTurnAction(input: {
  conversationId: string;
  assistantMessage: string;
  citations?: string[];
  meta?: SageMessageMeta;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const who = await me();
  if (!who) return { ok: false, error: "Not authorized." };
  const userId = who.userId;
  try {
    const [conv] = await db
      .select({ id: sageConversation.id })
      .from(sageConversation)
      .where(and(eq(sageConversation.id, input.conversationId), eq(sageConversation.userId, userId)));
    if (!conv) return { ok: false, error: "Conversation not found." };

    const m = input.meta ?? {};
    // Only a ready admin proposal waits for a confirm; staff proposals are blocked.
    const proposalState: ProposalState | null = m.proposal ? (who.role === "admin" && m.proposal.ready ? "pending" : "blocked") : null;
    const meta: SageMessageMeta = {
      tool: typeof m.tool === "string" ? m.tool.slice(0, 64) : undefined,
      toolResult: m.toolResult && JSON.stringify(m.toolResult).length < 60_000 ? m.toolResult : null,
      proposal: m.proposal ?? null,
      proposalState,
      engine: m.engine ?? null,
      routedBy: typeof m.routedBy === "string" ? m.routedBy.slice(0, 32) : undefined,
      seconds: typeof m.seconds === "number" ? Math.round(m.seconds) : undefined,
      canAnswer: m.canAnswer,
    };
    const [saved] = await db.insert(sageMessage).values({
      conversationId: input.conversationId,
      role: "assistant",
      content: input.assistantMessage,
      citations: input.citations?.length ? input.citations : null,
      meta,
    }).returning({ id: sageMessage.id });
    await db
      .update(sageConversation)
      .set({ updatedAt: new Date() })
      .where(eq(sageConversation.id, input.conversationId));
    revalidateSage();
    return { ok: true, id: saved.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the reply." };
  }
}

export async function renameSageConversationAction(id: string, title: string): Promise<ProposalResult> {
  const who = await me();
  if (!who) return { ok: false, message: "Not authorized." };
  const userId = who.userId;
  const clean = title.trim().slice(0, 120);
  if (!clean) return { ok: false, message: "Title can't be empty." };

  const res = await db
    .update(sageConversation)
    .set({ title: clean, updatedAt: new Date() })
    .where(and(eq(sageConversation.id, id), eq(sageConversation.userId, userId)))
    .returning({ id: sageConversation.id });
  if (res.length === 0) return { ok: false, message: "Conversation not found." };

  revalidateSage();
  return { ok: true, message: "Renamed." };
}

export async function deleteSageConversationAction(id: string): Promise<ProposalResult> {
  const who = await me();
  if (!who) return { ok: false, message: "Not authorized." };
  const userId = who.userId;

  const [existing] = await db
    .select({ id: sageConversation.id })
    .from(sageConversation)
    .where(and(eq(sageConversation.id, id), eq(sageConversation.userId, userId)));
  if (!existing) return { ok: false, message: "Conversation not found." };

  await db.delete(sageMessage).where(eq(sageMessage.conversationId, id));
  await db.delete(sageConversation).where(eq(sageConversation.id, id));

  revalidateSage();
  return { ok: true, message: "Deleted." };
}
