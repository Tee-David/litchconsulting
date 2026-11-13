import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { assistantChat, type AssistantResponse } from "@/lib/litchai/client";
import { sageCaller } from "@/lib/sage/caller";
import { db } from "@/lib/db/client";
import { client } from "@/lib/db/schema";

// Cloud answers take a few seconds. A local-only client's answer runs on the
// VM's model and can take over a minute, so keep the longer limit.
export const maxDuration = 120;
export const runtime = "nodejs";

/** Plain words for the relay's own failures (the engine reports its own as `error`). */
function relayFailure(raw: string) {
  // These regexes match the engine's raw error text; the messages we surface only ever name "Sage".
  if (/\/assistant\/chat → 404/.test(raw)) return { error: "unavailable", answer: "Sage is offline: the assistant service needs an update. Ask an admin to deploy it." };
  if (/is not set — cannot reach LitchAI/.test(raw)) return { error: "unavailable", answer: "Sage is not connected yet. An admin must connect the assistant service." };
  if (/timed? ?out|ETIMEDOUT|aborted/i.test(raw)) return { error: "timeout", answer: "Sage took too long to answer. The AI service is busy. Try again in a minute, or ask a shorter question." };
  return { error: "unavailable", answer: "Sage cannot reach its AI service right now. Try again in a minute. Your question was not lost: send it again." };
}

const EMPTY = { citations: [], tool: "none", routed_by: "none", can_answer: false, tool_result: null, proposal: null };

/**
 * Sage relay for admins and staff. The caller's role and scope come from the
 * session (never the body): staff send their assigned request ids and the
 * workbench conversations on them; their app reads are request_work only,
 * over those ids, with no money. A staff answer is shown only when the
 * engine confirms it applied the scope (`scope_applied`).
 */
export async function POST(req: Request) {
  const caller = await sageCaller();
  if (!caller) return new Response("Unauthorized", { status: 401 });
  if (!process.env.LITCHAI_API_URL) {
    return NextResponse.json({ ...EMPTY, answer: "Sage is not connected yet. An admin must connect the assistant service.", error: "unavailable", offline: true });
  }

  try {
    const body = await req.json();
    const message = typeof body.message === "string" ? body.message.slice(0, 3000) : "";
    if (!message.trim()) return NextResponse.json({ ...EMPTY, answer: "Write a question first.", error: "invalid" });
    const history = Array.isArray(body.history)
      ? (body.history as { role?: unknown; content?: unknown }[])
          .filter((h) => (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
          .slice(-20)
          .map((h) => ({ role: String(h.role), content: String(h.content).slice(0, 4000) }))
      : [];
    const staff = caller.role === "staff";
    // Staff never read one client's operational context: firm scope only.
    const scope: "firm" | "client" = !staff && body.scope === "client" ? "client" : "firm";
    const clientId = scope === "client" && typeof body.clientId === "string" && /^[0-9a-f-]{36}$/i.test(body.clientId) ? body.clientId : undefined;

    // A local-only client's data never leaves the VM: tell the engine.
    let localOnly = false;
    if (clientId) {
      const [c] = await db.select({ aiMode: client.aiMode }).from(client).where(eq(client.id, clientId)).limit(1);
      localOnly = c?.aiMode === "local_only";
    }
    const opts = {
      localOnly,
      conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
      caller: { role: caller.role, requestIds: caller.requestIds, workbenchIds: caller.workbenchIds },
    };
    let result: AssistantResponse = await assistantChat(message, history, scope, clientId, { tools: true }, opts);
    // Two-pass app read: the engine asks for live app data; read it here,
    // behind the caller's role, and ask again.
    if (result.needs_app_data) {
      const reads = await import("@/lib/sage/app-reads");
      const need = result.needs_app_data;
      const data = await (staff ? reads.resolveStaffSageAppRead(need, caller.requestIds ?? []) : reads.resolveSageAppRead(need)).catch((e: unknown) => {
        console.error("[sage] app read failed:", e instanceof Error ? e.message : e);
        return { error: "That data couldn't be read right now." };
      });
      result = await assistantChat(message, history, scope, clientId, { tools: true, data: { tool: need.tool, data } }, opts);
    }
    if (staff && result.scope_applied !== true) {
      // The engine did not confirm the staff scope: show nothing of the answer.
      return NextResponse.json({ ...EMPTY, answer: "", held: true, scope_applied: false });
    }
    if (staff && result.proposal) {
      // Staff cannot confirm writes in this version; the UI shows "Only an admin can do this".
      result = { ...result, proposal: { ...result.proposal, ready: false } };
    }
    return NextResponse.json(result);
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Sage relay failed";
    console.error("[sage] relay error:", raw);
    // Never a bare 500: Sage answers in words, with a next step.
    const f = relayFailure(raw);
    return NextResponse.json({ ...EMPTY, answer: f.answer, error: f.error });
  }
}
