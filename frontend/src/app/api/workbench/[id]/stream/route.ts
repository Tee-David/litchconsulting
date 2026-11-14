import { z } from "zod";
import { wbStream } from "@/lib/litchai/workbench";
import { workbenchAccess } from "@/lib/workbench/server";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
// A turn is at most 8 tool steps; local-only clients run on the VM's CPU model.
export const maxDuration = 300;

const body = z.object({
  message: z.string().trim().min(1).max(8000),
  selection: z.string().trim().max(200).nullable().optional(),
  /** A5: edit-and-resend or regenerate; the earlier question and answer are kept as a branch. */
  replaceLast: z.boolean().optional(),
});

/**
 * One Sage turn, streamed. The analysis server's SSE frames (plan, tool_call,
 * tool_result, provider, fallback, retry, final | error) are piped through as
 * they arrive; the browser never talks to the analysis server itself.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await workbenchAccess(id);
  if (!access.ok) return new Response("Not allowed", { status: access.status });
  const limited = await rateLimit(`wb-turn:${access.user.id}`, { limit: 30, windowSeconds: 60 });
  if (!limited.ok) return Response.json({ error: "Too many messages. Wait a minute." }, { status: 429 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Write a message first." }, { status: 400 });

  let upstream: Response;
  try {
    upstream = await wbStream(id, { message: parsed.data.message, selection: parsed.data.selection ?? null, replace_last: parsed.data.replaceLast ?? false }, req.signal);
  } catch {
    return Response.json({ error: "The analysis server did not answer. Try again in a minute." }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    const status = upstream.status === 404 ? 404 : 502;
    return Response.json({ error: status === 404 ? "This conversation is gone." : "The analysis server could not start this turn." }, { status });
  }
  return new Response(upstream.body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
