"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/admin/ui/toaster";
import { failureKind } from "@/lib/ai-words";
import { shortWhen, type SageMessageMeta, type SageProposal, type SageRole, type SageTurn } from "@/lib/sage/present";
import {
  applyAssistantProposalAction,
  beginSageTurnAction,
  deleteSageConversationAction,
  dismissSageProposalAction,
  finishSageTurnAction,
  listSageConversationsAction,
  loadSageConversationAction,
  renameSageConversationAction,
  type RailConversation,
  voteSageMessageAction,
} from "@/app/admin/sage/actions";

type EngineReply = {
  answer?: string;
  citations?: string[];
  tool?: string;
  routed_by?: string;
  can_answer?: boolean;
  tool_result?: Record<string, unknown> | null;
  proposal?: SageProposal | null;
  error?: string | null;
  engine?: SageTurn["engine"];
  held?: boolean;
  offline?: boolean;
};

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

/**
 * One Sage conversation, shared by the Sage page and the widget's Sage tab:
 * persisting turns, the relay call, stop and retry, proposals, and the
 * per-user history rail. The server re-checks the role on every call.
 */
export function useSageChat({ role, basePath, syncUrl = false, enabled = true }: { role: SageRole; basePath: string; syncUrl?: boolean; enabled?: boolean }) {
  const toast = useToast();
  const [turns, setTurns] = useState<SageTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [waited, setWaited] = useState(0);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [scope, setScope] = useState<"firm" | "client">("firm");
  const [clientId, setClientId] = useState("");
  const [applying, setApplying] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [opening, setOpening] = useState(false);

  const [conversations, setConversations] = useState<RailConversation[]>([]);
  const [query, setQuery] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refreshHistory = useCallback(async (q: string) => {
    try {
      const res = await listSageConversationsAction(q);
      setHistoryError(!res.ok);
      if (res.ok) setConversations(res.conversations);
    } catch {
      setHistoryError(true);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => void refreshHistory(query), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [enabled, query, refreshHistory]);

  useEffect(() => {
    if (!loading) {
      setWaited(0);
      return;
    }
    const started = Date.now();
    const t = setInterval(() => setWaited(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [loading]);

  const setActive = useCallback(
    (id: string | null) => {
      setConversationId(id);
      if (syncUrl && typeof window !== "undefined") window.history.replaceState(null, "", id ? `${basePath}?c=${id}` : basePath);
    },
    [basePath, syncUrl],
  );

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    setTurns([]);
    setTitle(null);
    setStartedAt(null);
    setActive(null);
  }, [setActive]);

  const select = useCallback(
    async (id: string) => {
      setOpening(true);
      try {
        const res = await loadSageConversationAction(id);
        if (!res.ok || !res.conversation) {
          toast.error(res.error || "That conversation could not be opened.");
          return;
        }
        setActive(id);
        setTitle(res.conversation.title);
        setStartedAt(shortWhen(res.conversation.createdAt));
        setScope(role === "admin" && res.conversation.scope === "client" ? "client" : "firm");
        setClientId(res.conversation.clientId || "");
        setTurns(
          (res.messages ?? []).map((m) => {
            const meta = (m.meta ?? {}) as SageMessageMeta;
            return {
              id: m.id,
              savedId: m.id,
              role: m.role === "user" ? "user" : "assistant",
              content: m.content,
              at: shortWhen(m.createdAt),
              citations: Array.isArray(m.citations) ? (m.citations as string[]) : undefined,
              tool: meta.tool,
              toolResult: meta.toolResult ?? null,
              proposal: meta.proposal ?? null,
              proposalState: meta.proposalState ?? null,
              engine: meta.engine ?? null,
              routedBy: meta.routedBy,
              seconds: meta.seconds,
              vote: meta.feedback?.vote ?? null,
            } satisfies SageTurn;
          }),
        );
      } catch {
        toast.error("That conversation could not be opened. Check your connection.");
      } finally {
        setOpening(false);
      }
    },
    [role, setActive, toast],
  );

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || loading) return false;
      if (scope === "client" && !clientId) {
        toast.error("Pick a client first, or set the scope to the firm.");
        return false;
      }
      const history = turns.filter((t) => !t.failure && !t.held && t.content).map((t) => ({ role: t.role, content: t.content }));
      const now = shortWhen(new Date());
      setTurns((prev) => [...prev, { id: uid(), role: "user", content: q, at: now }]);
      setLoading(true);
      const begun = await beginSageTurnAction({ conversationId, scope, clientId: scope === "client" ? clientId : null, userMessage: q }).catch(() => null);
      let activeId = conversationId;
      if (begun?.ok) {
        activeId = begun.conversationId;
        if (!conversationId) {
          setActive(begun.conversationId);
          setStartedAt(now);
        }
        setTitle(begun.title);
        void refreshHistory(query);
      }
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const started = Date.now();
      try {
        const res = await fetch("/api/sage", {
          method: "POST",
          signal: ctrl.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: q, history, scope, clientId: scope === "client" ? clientId : undefined, conversationId: activeId ?? undefined }),
        });
        if (res.status === 401) throw new Error("auth");
        const data = (await res.json().catch(() => ({}))) as EngineReply;
        if (data.offline) setOffline(true);
        const failure = failureKind(data.error ?? null);
        const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
        const id = uid();
        const turn: SageTurn = {
          id,
          role: "assistant",
          content: failure || data.held ? "" : data.answer || "Sage has no answer for that. Ask it another way.",
          citations: data.citations,
          tool: data.tool,
          toolResult: data.tool_result ?? null,
          proposal: data.proposal ?? null,
          proposalState: data.proposal ? (role === "admin" && data.proposal.ready ? "pending" : "blocked") : null,
          engine: data.engine ?? null,
          routedBy: data.routed_by,
          canAnswer: data.can_answer,
          seconds: failure || data.held ? undefined : seconds,
          failure,
          held: Boolean(data.held),
          retryText: failure ? q : undefined,
          fresh: true,
        };
        setTurns((prev) => [...prev, turn]);
        if (activeId && !failure && !data.held) {
          void finishSageTurnAction({
            conversationId: activeId,
            assistantMessage: turn.content,
            citations: data.citations,
            meta: { tool: turn.tool, toolResult: turn.toolResult, proposal: turn.proposal, engine: turn.engine, routedBy: turn.routedBy, seconds, canAnswer: turn.canAnswer },
          })
            .then((r) => {
              if (r.ok && r.id) setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, savedId: r.id } : t)));
              void refreshHistory(query);
            })
            .catch(() => undefined);
        }
        return true;
      } catch (err) {
        const stopped = err instanceof Error && err.name === "AbortError";
        const auth = err instanceof Error && err.message === "auth";
        if (auth) toast.error("Your session ended. Sign in again to use Sage.");
        setTurns((prev) => [...prev, { id: uid(), role: "assistant", content: "", failure: stopped ? "stopped" : "dropped", retryText: q }]);
        return false;
      } finally {
        abortRef.current = null;
        setLoading(false);
      }
    },
    [clientId, conversationId, loading, query, refreshHistory, role, scope, setActive, toast, turns],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const retry = useCallback(
    (turnId: string, text: string) => {
      setTurns((prev) => prev.filter((t) => t.id !== turnId));
      void send(text);
    },
    [send],
  );

  const confirm = useCallback(
    async (turnId: string, proposal: SageProposal) => {
      const t = turns.find((x) => x.id === turnId);
      setApplying(turnId);
      try {
        const r = await applyAssistantProposalAction(proposal, t?.savedId);
        if (r.ok) {
          toast.success(r.message);
          setTurns((prev) => prev.map((x) => (x.id === turnId ? { ...x, proposalState: "confirmed" } : x)));
          void refreshHistory(query);
        } else {
          toast.error(r.message);
          if (r.message.startsWith("Only an admin")) setTurns((prev) => prev.map((x) => (x.id === turnId ? { ...x, proposalState: "blocked" } : x)));
        }
      } catch {
        toast.error("The plan was not applied. Check your connection and try again.");
      } finally {
        setApplying(null);
      }
    },
    [query, refreshHistory, toast, turns],
  );

  const dismiss = useCallback(
    async (turnId: string) => {
      const t = turns.find((x) => x.id === turnId);
      setTurns((prev) => prev.map((x) => (x.id === turnId ? { ...x, proposalState: "dismissed" } : x)));
      if (t?.savedId) {
        await dismissSageProposalAction(t.savedId).catch(() => undefined);
        void refreshHistory(query);
      }
    },
    [query, refreshHistory, turns],
  );

  const rename = useCallback(
    async (id: string, next: string) => {
      const clean = next.trim();
      if (!clean) return;
      const r = await renameSageConversationAction(id, clean);
      if (!r.ok) return toast.error(r.message);
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: clean } : c)));
      if (id === conversationId) setTitle(clean);
    },
    [conversationId, toast],
  );

  const remove = useCallback(
    async (id: string) => {
      const r = await deleteSageConversationAction(id);
      if (!r.ok) throw new Error(r.message);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (id === conversationId) newChat();
      toast.success("Conversation deleted");
    },
    [conversationId, newChat, toast],
  );

  // A1: Good / Bad on an answer (saved once the answer has its message id).
  const vote = useCallback(
    async (turnId: string, v: "good" | "bad" | null, note?: string) => {
      const t = turns.find((x) => x.id === turnId);
      setTurns((prev) => prev.map((x) => (x.id === turnId ? { ...x, vote: v } : x)));
      if (!t?.savedId) return;
      const r = await voteSageMessageAction(t.savedId, v, note).catch(() => null);
      if (r?.ok) {
        if (v) toast.success(r.message);
      } else toast.error(r?.message ?? "That vote was not saved. Try again.");
    },
    [turns, toast],
  );
  // A1: ask the last question again (the earlier answer stays above).
  const regenerate = useCallback(() => {
    const last = [...turns].reverse().find((t) => t.role === "user");
    if (last && !loading) void send(last.content);
  }, [turns, loading, send]);

  return {
    turns,
    loading,
    vote,
    regenerate,
    waited,
    opening,
    conversationId,
    title,
    startedAt,
    scope,
    setScope,
    clientId,
    setClientId,
    applying,
    offline,
    conversations,
    query,
    setQuery,
    historyLoading,
    historyError,
    refreshHistory: () => refreshHistory(query),
    newChat,
    select,
    send,
    stop,
    retry,
    confirm,
    dismiss,
    rename,
    remove,
  };
}
export type SageChat = ReturnType<typeof useSageChat>;
