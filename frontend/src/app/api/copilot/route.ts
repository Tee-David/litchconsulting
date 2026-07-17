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
    const result = await assistantChat(message, history, scope, clientId);
    return NextResponse.json(result);
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Sage relay failed";
    console.error("[copilot] relay error:", raw);
    // The endpoint exists in this codebase but not on an older VM build — turn
    // the raw "→ 404" into something an admin can act on.
    const notDeployed = /\/assistant\/chat → 404/.test(raw);
    const notConfigured = /is not set — cannot reach LitchAI/.test(raw);
    const error = notDeployed
      ? "Sage is offline: the LitchAI service on the server needs updating to this build."
      : notConfigured
        ? "Sage is not configured: LITCHAI_API_URL is unset."
        : raw;
    return NextResponse.json({ error }, { status: notDeployed || notConfigured ? 503 : 500 });
  }
}
