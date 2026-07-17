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
    console.error("[copilot] relay error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Copilot relay failed" },
      { status: 500 }
    );
  }
}
