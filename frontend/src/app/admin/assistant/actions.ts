"use server";

import { isAdmin } from "@/lib/server-user";
import { recordAudit } from "@/lib/audit";
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
        meta: { via: "copilot", status: res.status },
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
        meta: { via: "copilot", lineItemId: lineId, categoryCode: res.category_code },
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
