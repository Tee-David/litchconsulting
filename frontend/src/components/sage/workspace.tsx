"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { History, PlugZap } from "lucide-react";
import { Sheet } from "@/components/kit";
import { Select } from "@/components/ui/select";
import { STARTERS, followUpsFor, type SageRole } from "@/lib/sage/present";
import { cn } from "@/lib/utils";
import { SageAnswer, SageMark, UserBubble, Working } from "./answer";
import { SageComposer } from "./composer";
import { HistoryRail } from "./history-rail";
import { useSageChat } from "./use-sage-chat";

type Client = { id: string; name: string | null; company: string | null };

/**
 * The Sage page (admin at /admin/sage, staff at /work/sage): history rail,
 * thread header with the real scope, answers as working papers, follow-up
 * chips and the composer. Phones: the rail is a sheet; sources sit under
 * each answer.
 */
export function SageWorkspace({
  role,
  basePath,
  online,
  clients = [],
  frameClassName,
}: {
  role: SageRole;
  basePath: string;
  /** False when LITCHAI_API_URL is unset: a calm "not connected" state. */
  online: boolean;
  clients?: Client[];
  frameClassName?: string;
}) {
  const chat = useSageChat({ role, basePath, syncUrl: true });
  const [railOpen, setRailOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const connected = online && !chat.offline;

  // Reopen the thread named in the URL (?c=…).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("c");
    if (id) void chat.select(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.turns.length, chat.loading]);

  const lastAnswer = [...chat.turns].reverse().find((t) => t.role === "assistant" && !t.failure && !t.held);
  const chips = useMemo(() => (chat.turns.length ? followUpsFor(lastAnswer?.tool, role) : []), [chat.turns.length, lastAnswer?.tool, role]);
  const sourceCount = chat.turns.reduce((n, t) => n + (t.citations?.length ?? 0) + (t.toolResult ? 1 : 0), 0);
  const actions = chat.turns.filter((t) => t.proposal).length;
  const empty = chat.turns.length === 0;
  const clientName = clients.find((c) => c.id === chat.clientId);

  return (
    <div className={cn("flex min-h-0 overflow-hidden bg-desk", frameClassName)}>
      <aside aria-label="Chat history" className="hidden w-[268px] shrink-0 border-r border-hairline bg-surface lg:block">
        <HistoryRail chat={chat} online={connected} />
      </aside>

      <Sheet open={railOpen} onClose={() => setRailOpen(false)} title="Chats" size="sm">
        <div className="-mx-5 -my-4 h-[70dvh] sm:h-full">
          <HistoryRail chat={chat} online={connected} heading={false} onPicked={() => setRailOpen(false)} />
        </div>
      </Sheet>

      <section aria-label="Sage" className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline bg-paper px-4 py-2.5 sm:px-8">
          <button
            type="button"
            onClick={() => setRailOpen(true)}
            aria-label="Open chat history"
            className="grid size-10 shrink-0 place-items-center rounded-ctl border border-hairline text-body outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 lg:hidden"
          >
            <History className="size-[18px]" strokeWidth={1.5} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-ink">{chat.title ?? "New chat"}</p>
            <p className="truncate text-xs text-muted">
              {chat.startedAt
                ? [`Started ${chat.startedAt}`, sourceCount ? `${sourceCount} ${sourceCount === 1 ? "source" : "sources"}` : null, actions ? `${actions} ${actions === 1 ? "action" : "actions"}` : null]
                    .filter(Boolean)
                    .join(" · ")
                : role === "admin"
                  ? "Ask about clients, money, requests or Nigerian tax rules"
                  : "Ask about your assigned requests or Nigerian tax rules"}
            </p>
          </div>
          {role === "admin" ? (
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <span className="text-[12.5px] text-body">Scope</span>
              <div className="w-40 shrink-0">
                <Select
                  value={chat.scope}
                  onChange={(v) => chat.setScope(v === "client" ? "client" : "firm")}
                  aria-label="Scope"
                  options={[
                    { value: "firm", label: "Whole firm" },
                    { value: "client", label: "One client" },
                  ]}
                />
              </div>
              {chat.scope === "client" ? (
                <div className="min-w-0 flex-1 sm:w-56 sm:flex-none">
                  <Select
                    value={chat.clientId}
                    onChange={chat.setClientId}
                    searchable
                    placeholder="Pick a client"
                    aria-label="Client"
                    options={clients.map((c) => ({ value: c.id, label: c.company || c.name || "Client" }))}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <span className="inline-flex h-[30px] items-center gap-1.5 rounded-ctl border border-hairline px-2.5 text-[12.5px] text-body">
              Scope <b className="font-semibold text-ink">Your assigned requests</b>
            </span>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-6 sm:px-8" aria-live="polite" aria-busy={chat.loading || chat.opening}>
          <div className="mx-auto flex w-full max-w-[900px] flex-col gap-5">
            {!connected ? (
              <div role="status" className="rounded-card border border-hairline bg-paper p-5">
                <p className="flex items-center gap-2 font-display text-base font-semibold text-ink">
                  <PlugZap className="size-[18px] text-muted" strokeWidth={1.5} aria-hidden /> Sage is not connected
                </p>
                <p className="mt-1 text-sm text-body">
                  {role === "admin"
                    ? "The Sage service is not reachable from this site. Connect it, then ask again. Your earlier chats stay readable."
                    : "Sage cannot answer right now. An admin must connect the Sage service. Your earlier chats stay readable."}
                </p>
              </div>
            ) : null}

            {chat.opening ? (
              <div className="flex flex-col gap-4" aria-label="Opening the chat">
                <div className="h-10 w-2/3 self-end rounded-2xl bg-paper" />
                <div className="h-48 rounded-card bg-paper" />
              </div>
            ) : empty && connected ? (
              <div className="rounded-card bg-paper p-5 shadow-[0_1px_2px_rgb(10_14_26/0.05)] dark:shadow-none dark:ring-1 dark:ring-hairline sm:p-6">
                <div className="flex items-center gap-2.5">
                  <SageMark />
                  <div>
                    <h2 className="font-display text-lg font-semibold text-ink">Ask Sage</h2>
                    <p className="text-sm text-body">
                      {role === "admin"
                        ? "Answers come from your books and the firm knowledge base, with the source of each figure. Changes come back as a plan you confirm."
                        : "Answers cover the requests assigned to you and the firm knowledge base. Sage shows no amounts and makes no changes for staff."}
                    </p>
                  </div>
                </div>
                <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                  {STARTERS[role].map((s) => (
                    <li key={s.label}>
                      <button
                        type="button"
                        onClick={() => void chat.send(s.prompt)}
                        className="flex min-h-11 w-full items-center rounded-ctl bg-surface px-3.5 py-2.5 text-left text-sm text-ink outline-none transition-colors hover:bg-brand-tint focus-visible:ring-2 focus-visible:ring-accent/40"
                      >
                        {s.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              chat.turns.map((t) =>
                t.role === "user" ? (
                  <UserBubble key={t.id} text={t.content} at={t.at} />
                ) : (
                  <SageAnswer
                    key={t.id}
                    turn={t}
                    role={role}
                    busy={chat.applying === t.id}
                    onRetry={t.retryText && !chat.loading ? () => chat.retry(t.id, t.retryText!) : undefined}
                    onConfirm={(p) => void chat.confirm(t.id, p)}
                    onDismiss={() => void chat.dismiss(t.id)}
                  />
                ),
              )
            )}
            {chat.loading ? <Working seconds={chat.waited} onStop={chat.stop} /> : null}
            <div ref={bottom} />
          </div>
        </div>

        <div className="shrink-0 px-4 pb-4 pt-3 sm:px-8">
          <div className="mx-auto flex w-full max-w-[900px] flex-col gap-2">
            <SageComposer
              onSend={chat.send}
              onStop={chat.stop}
              busy={chat.loading}
              disabled={!connected}
              disabledReason="Sage is not connected"
              chips={chips}
              placeholder={
                chat.scope === "client" && clientName
                  ? `Ask about ${clientName.company || clientName.name}`
                  : role === "admin"
                    ? "Ask about clients, money, requests or Nigerian tax rules"
                    : "Ask about your requests or Nigerian tax rules"
              }
            />
            <p className="text-center text-[11.5px] text-muted">
              {role === "admin"
                ? "Amounts come from your books, never from the model. Every confirmed action goes to the audit log."
                : "Sage reads only the requests assigned to you. Check its answer before you act on it."}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
