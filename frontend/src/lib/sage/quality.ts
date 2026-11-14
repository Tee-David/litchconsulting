import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sageMessage } from "@/lib/db/schema";
import { wbFeedbackReport } from "@/lib/litchai/workbench";
import type { SageMessageMeta } from "./present";

/**
 * H1: Good / Bad votes on Sage answers (the Sage page and the workbench) for the
 * last days, with what produced each answer, so routing mistakes can be counted.
 */
export type SageVote = {
  source: "Sage" | "Workbench";
  at: string;
  vote: "good" | "bad";
  note: string;
  question: string;
  route: string;
  tool: string;
  model: string;
  href: string;
};

export type SageQuality = {
  days: number;
  votes: SageVote[];
  good: number;
  bad: number;
  /** Bad answers counted by route, by tool and by model, most first. */
  badBy: { route: [string, number][]; tool: [string, number][]; model: [string, number][] };
  /** True when the workbench engine could not be read (its votes are missing). */
  engineMissing: boolean;
};

const count = (xs: string[]) =>
  [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 8);

export async function sageQuality(days = 7): Promise<SageQuality> {
  const since = new Date(Date.now() - days * 86_400_000);
  const votes: SageVote[] = [];

  // Sage page votes: kept on the answer (sage_message.meta.feedback).
  const answers = await db
    .select({ id: sageMessage.id, conversationId: sageMessage.conversationId, meta: sageMessage.meta, createdAt: sageMessage.createdAt })
    .from(sageMessage)
    .where(and(eq(sageMessage.role, "assistant"), gte(sageMessage.createdAt, new Date(since.getTime() - 30 * 86_400_000))))
    .limit(4000);
  const voted = answers.filter((a) => {
    const fb = (a.meta as SageMessageMeta | null)?.feedback;
    return fb && new Date(fb.at) >= since;
  });
  const convIds = [...new Set(voted.map((a) => a.conversationId))];
  const questions = convIds.length
    ? await db
        .select({ conversationId: sageMessage.conversationId, content: sageMessage.content, createdAt: sageMessage.createdAt })
        .from(sageMessage)
        .where(and(inArray(sageMessage.conversationId, convIds), eq(sageMessage.role, "user")))
    : [];
  for (const a of voted) {
    const meta = a.meta as SageMessageMeta;
    const q = questions
      .filter((x) => x.conversationId === a.conversationId && x.createdAt <= a.createdAt)
      .sort((x, y) => +y.createdAt - +x.createdAt)[0];
    votes.push({
      source: "Sage",
      at: meta.feedback!.at,
      vote: meta.feedback!.vote,
      note: meta.feedback!.note ?? "",
      question: (q?.content ?? "").replace(/\s+/g, " ").slice(0, 300),
      route: meta.routedBy ?? "unknown",
      tool: meta.tool ?? "none",
      model: meta.engine ? `${meta.engine.model} on ${meta.engine.provider}` : "no model",
      href: `/admin/sage?c=${a.conversationId}`,
    });
  }

  // Workbench votes: kept by the engine on each answer.
  let engineMissing = false;
  if (process.env.LITCHAI_API_URL) {
    try {
      const rep = await wbFeedbackReport(days);
      for (const v of rep.votes) {
        if (v.vote !== "good" && v.vote !== "bad") continue;
        votes.push({
          source: "Workbench",
          at: v.at,
          vote: v.vote,
          note: v.note,
          question: v.question,
          route: v.layer ?? "unknown",
          tool: v.tools.length ? v.tools.join(", ") : "none",
          model: v.model ?? (v.provider ? v.provider : "no model"),
          href: `/admin/analyses/w/${v.conversation_id}`,
        });
      }
    } catch {
      engineMissing = true;
    }
  } else engineMissing = true;

  votes.sort((a, b) => b.at.localeCompare(a.at));
  const bad = votes.filter((v) => v.vote === "bad");
  return {
    days,
    votes,
    good: votes.length - bad.length,
    bad: bad.length,
    badBy: { route: count(bad.map((v) => v.route)), tool: count(bad.map((v) => v.tool)), model: count(bad.map((v) => v.model)) },
    engineMissing,
  };
}
