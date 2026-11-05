"use server";

import { and, eq, ilike, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { client, sageConversation, sageMessage, type SageConversation, type SageMessage } from "@/lib/db/schema";
import taxConfig from "@/lib/tax/nigeria-tax-config.json";
import { getCurrentUserId, isAdmin } from "@/lib/server-user";
import { recordAudit } from "@/lib/audit";
import { listSageConversations, getSageConversation, getSageMessages } from "@/lib/db/queries/sage";
import {
  recategorizeLine,
  transitionEngagement,
  type AssistantProposal,
} from "@/lib/litchai/client";

export type ProposalResult = { ok: boolean; message: string };

const ENGAGEMENT_ACTIONS = new Set(["submit", "approve", "reject", "lock", "reopen"]);

/**
 * Apply a Sage WRITE proposal — the backend only ever *proposes* these; a
 * human confirms here, then we dispatch to the matching LitchAI endpoint. Admin
 * guarded; every applied proposal is written to the audit trail.
 */
export async function applyAssistantProposalAction(
  proposal: AssistantProposal,
): Promise<ProposalResult> {
  if (!(await isAdmin())) return { ok: false, message: "Not authorized." };
  if (!proposal?.ready) {
    return { ok: false, message: "That proposal is missing details — rephrase your request." };
  }

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
      return { ok: true, message: `Engagement ${id} → ${res.status}.` };
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
      return { ok: true, message: `Line ${lineId} reclassified to ${res.category_code}.` };
    }

    if (proposal.action === "create_billing_draft") {
      return await createBillingDraft(proposal.params);
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

export async function listSageConversationsAction(
  search?: string,
): Promise<{ ok: boolean; conversations: SageConversation[] }> {
  const userId = await getCurrentUserId();
  if (!userId || !(await isAdmin())) return { ok: false, conversations: [] };
  return { ok: true, conversations: await listSageConversations(userId, { search }) };
}

export async function loadSageConversationAction(
  id: string,
): Promise<{ ok: boolean; conversation?: SageConversation; messages?: SageMessage[]; error?: string }> {
  const userId = await getCurrentUserId();
  if (!userId || !(await isAdmin())) return { ok: false, error: "Not authorized." };
  const conversation = await getSageConversation(id, userId);
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
  const userId = await getCurrentUserId();
  if (!userId || !(await isAdmin())) return { ok: false, error: "Not authorized." };

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

    await db.insert(sageMessage).values({ conversationId, role: "user", content: input.userMessage });
    revalidatePath("/admin/sage");
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
}): Promise<{ ok: boolean; error?: string }> {
  const userId = await getCurrentUserId();
  if (!userId || !(await isAdmin())) return { ok: false, error: "Not authorized." };
  try {
    const [conv] = await db
      .select({ id: sageConversation.id })
      .from(sageConversation)
      .where(and(eq(sageConversation.id, input.conversationId), eq(sageConversation.userId, userId)));
    if (!conv) return { ok: false, error: "Conversation not found." };

    await db.insert(sageMessage).values({
      conversationId: input.conversationId,
      role: "assistant",
      content: input.assistantMessage,
      citations: input.citations?.length ? input.citations : null,
    });
    await db
      .update(sageConversation)
      .set({ updatedAt: new Date() })
      .where(eq(sageConversation.id, input.conversationId));
    revalidatePath("/admin/sage");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the reply." };
  }
}

export async function renameSageConversationAction(id: string, title: string): Promise<ProposalResult> {
  const userId = await getCurrentUserId();
  if (!userId || !(await isAdmin())) return { ok: false, message: "Not authorized." };
  const clean = title.trim().slice(0, 120);
  if (!clean) return { ok: false, message: "Title can't be empty." };

  const res = await db
    .update(sageConversation)
    .set({ title: clean, updatedAt: new Date() })
    .where(and(eq(sageConversation.id, id), eq(sageConversation.userId, userId)))
    .returning({ id: sageConversation.id });
  if (res.length === 0) return { ok: false, message: "Conversation not found." };

  revalidatePath("/admin/sage");
  return { ok: true, message: "Renamed." };
}

export async function deleteSageConversationAction(id: string): Promise<ProposalResult> {
  const userId = await getCurrentUserId();
  if (!userId || !(await isAdmin())) return { ok: false, message: "Not authorized." };

  const [existing] = await db
    .select({ id: sageConversation.id })
    .from(sageConversation)
    .where(and(eq(sageConversation.id, id), eq(sageConversation.userId, userId)));
  if (!existing) return { ok: false, message: "Conversation not found." };

  await db.delete(sageMessage).where(eq(sageMessage.conversationId, id));
  await db.delete(sageConversation).where(eq(sageConversation.id, id));

  revalidatePath("/admin/sage");
  return { ok: true, message: "Deleted." };
}
