"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { sageConversation, sageMessage, type SageConversation, type SageMessage } from "@/lib/db/schema";
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

    return { ok: false, message: `Don't know how to apply "${proposal.action}".` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to apply the proposal.",
    };
  }
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

export type SaveTurnInput = {
  conversationId?: string | null;
  scope: "firm" | "client";
  clientId?: string | null;
  userMessage: string;
  assistantMessage: string;
  citations?: string[];
};
export type SaveTurnResult =
  | { ok: true; conversationId: string; title: string }
  | { ok: false; error: string };

/** Persist one turn (user + assistant message), creating the conversation on
 *  the first turn. Called after the /api/sage round trip already has an
 *  answer, so this is a single follow-up write, not on the request's critical
 *  path for getting a reply. */
export async function saveSageTurnAction(input: SaveTurnInput): Promise<SaveTurnResult> {
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
      await db
        .update(sageConversation)
        .set({ updatedAt: new Date() })
        .where(eq(sageConversation.id, conversationId));
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

    await db.insert(sageMessage).values([
      { conversationId, role: "user", content: input.userMessage },
      {
        conversationId,
        role: "assistant",
        content: input.assistantMessage,
        citations: input.citations?.length ? input.citations : null,
      },
    ]);

    revalidatePath("/admin/sage");
    return { ok: true, conversationId, title };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the conversation." };
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
