import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server-user";
import { assistantChat } from "@/lib/litchai/client";

// Sage runs a local model on the VM: a warm reply is a few seconds, but a cold
// start loads the embedding model and measured 77s end-to-end. Vercel's default
// function timeout is 10s, which would abort every cold call — so raise it.
export const maxDuration = 120;
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });
  
  try {
    const { message, history, scope, clientId } = await req.json();
    let result = await assistantChat(message, history, scope, clientId, { tools: true });
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
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Sage relay failed";
    console.error("[sage] relay error:", raw);
    // The endpoint exists in this codebase but not on an older VM build — turn
    // the raw "→ 404" into something an admin can act on. These regexes match the
    // engine's raw error text; the messages we surface only ever name "Sage".
    const notDeployed = /\/assistant\/chat → 404/.test(raw);
    const notConfigured = /is not set — cannot reach LitchAI/.test(raw);
    const error = notDeployed
      ? "Sage is offline — the assistant service needs updating."
      : notConfigured
        ? "Sage is not configured — the assistant service isn't connected yet."
        : "Sage couldn't reach the assistant service. Please try again shortly.";
    return NextResponse.json({ error }, { status: notDeployed || notConfigured ? 503 : 500 });
  }
}
