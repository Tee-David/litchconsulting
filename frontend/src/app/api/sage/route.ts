import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { isAdmin } from "@/lib/server-user";
import { assistantChat } from "@/lib/litchai/client";
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

export async function POST(req: Request) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });

  try {
    const { message, history, scope, clientId, conversationId } = await req.json();
    // A local-only client's data never leaves the VM: tell the engine.
    let localOnly = false;
    if (scope === "client" && typeof clientId === "string" && /^[0-9a-f-]{36}$/i.test(clientId)) {
      const [c] = await db.select({ aiMode: client.aiMode }).from(client).where(eq(client.id, clientId)).limit(1);
      localOnly = c?.aiMode === "local_only";
    }
    const opts = { localOnly, conversationId: typeof conversationId === "string" ? conversationId : undefined };
    let result = await assistantChat(message, history, scope, clientId, { tools: true }, opts);
    // Two-pass app read: the engine asks for live app data (billing, privacy,
    // requests, backups); read it here, behind isAdmin(), and ask again.
    if (result.needs_app_data) {
      const { resolveSageAppRead } = await import("@/lib/sage/app-reads");
      const data = await resolveSageAppRead(result.needs_app_data).catch((e: unknown) => {
        console.error("[sage] app read failed:", e instanceof Error ? e.message : e);
        return { error: "That data couldn't be read right now." };
      });
      result = await assistantChat(message, history, scope, clientId, {
        tools: true,
        data: { tool: result.needs_app_data.tool, data },
      }, opts);
    }
    return NextResponse.json(result);
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Sage relay failed";
    console.error("[sage] relay error:", raw);
    // Never a bare 500: Sage answers in words, with a next step.
    const f = relayFailure(raw);
    return NextResponse.json({ answer: f.answer, citations: [], tool: "none", routed_by: "none", can_answer: false, tool_result: null, proposal: null, error: f.error });
  }
}
