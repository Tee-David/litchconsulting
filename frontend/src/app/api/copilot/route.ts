import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server-user";
import { assistantChat } from "@/lib/litchai/client";

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
