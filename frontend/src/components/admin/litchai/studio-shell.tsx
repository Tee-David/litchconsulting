"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Bot,
  FolderOpen,
  Inbox,
  Sparkles,
  Table2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { DocumentList } from "./document-list";
import type { LitchaiDocument } from "@/lib/litchai/client";

export type StudioClientGroup = {
  clientId: string;
  clientName: string;
  documents: LitchaiDocument[];
};

/**
 * AI Studio (Omni-Agent inspo): clients down the left, their analyses in the
 * middle, and a welcome workbench when nothing is running yet. Analyses are
 * triggered from a request's AI panel — this is the cross-client overview.
 */
export function StudioShell({
  groups,
  requestLinks,
}: {
  groups: StudioClientGroup[];
  /** litchai document_id → request deep link (when the doc came from a request) */
  requestLinks: Record<string, { requestId: string; requestNumber: string }>;
}) {
  const [selected, setSelected] = useState<string | "all">("all");

  const documents = useMemo(() => {
    const all = groups.flatMap((g) => g.documents);
    if (selected === "all") return all;
    return groups.find((g) => g.clientId === selected)?.documents ?? [];
  }, [groups, selected]);

  const totalDocs = groups.reduce((s, g) => s + g.documents.length, 0);
  const needsReview = groups
    .flatMap((g) => g.documents)
    .reduce((s, d) => s + Number((d.progress as Record<string, unknown>)?.needs_review ?? 0), 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      {/* Client sidebar */}
      <aside className="space-y-1 lg:border-r lg:border-hairline lg:pr-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
          <Users className="size-3.5" /> Clients
        </p>
        <button
          type="button"
          onClick={() => setSelected("all")}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors",
            selected === "all" ? "bg-brand-tint text-brand" : "text-body hover:bg-surface"
          )}
        >
          All analyses
          <span className="text-xs font-medium text-muted">{totalDocs}</span>
        </button>
        {groups.map((g) => (
          <button
            key={g.clientId}
            type="button"
            onClick={() => setSelected(g.clientId)}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors",
              selected === g.clientId ? "bg-brand-tint text-brand" : "text-body hover:bg-surface"
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <FolderOpen className="size-4 shrink-0" />
              <span className="truncate">{g.clientName}</span>
            </span>
            <span className="text-xs font-medium text-muted">{g.documents.length}</span>
          </button>
        ))}
      </aside>

      {/* Main */}
      <div className="min-w-0 space-y-5">
        {totalDocs > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-card border border-hairline bg-paper px-4 py-3">
              <p className="text-xs text-muted">Analyses</p>
              <p className="font-display text-xl font-bold text-ink">{totalDocs}</p>
            </div>
            <div className="rounded-card border border-hairline bg-paper px-4 py-3">
              <p className="text-xs text-muted">Lines needing review</p>
              <p
                className={cn(
                  "font-display text-xl font-bold",
                  needsReview > 0 ? "text-amber-600 dark:text-amber-400" : "text-ink"
                )}
              >
                {needsReview}
              </p>
            </div>
            <div className="rounded-card border border-hairline bg-paper px-4 py-3">
              <p className="text-xs text-muted">Clients</p>
              <p className="font-display text-xl font-bold text-ink">{groups.length}</p>
            </div>
          </div>
        )}

        {documents.length === 0 ? (
          <div className="rounded-card border border-hairline bg-paper p-8">
            <div className="mx-auto max-w-lg text-center">
              <span className="mx-auto grid size-14 place-items-center rounded-full bg-brand-tint text-brand">
                <Bot className="size-7" />
              </span>
              <h2 className="mt-4 font-display text-lg font-bold text-ink">
                Your AI workbench is ready
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-body">
                Send a client&apos;s documents for analysis from their request page and LitchAI
                compiles them into a formula-driven workbook — every number traceable, every
                formula verified before it can reach a client.
              </p>
            </div>
            <div className="mx-auto mt-6 grid max-w-2xl gap-3 sm:grid-cols-3">
              {[
                {
                  href: "/admin/requests",
                  icon: Inbox,
                  title: "Analyze request docs",
                  body: "Pick a request → LitchAI panel → Analyze.",
                },
                {
                  href: "/admin/litchai/observability",
                  icon: Activity,
                  title: "Pipeline health",
                  body: "Rung hit-rates, fallbacks, review counts.",
                },
                {
                  href: "/admin/requests?filter=action",
                  icon: Sparkles,
                  title: "Needs your action",
                  body: "Quotes to send, reviews to finish.",
                },
              ].map((c) => (
                <Link
                  key={c.href + c.title}
                  href={c.href}
                  className="group flex flex-col rounded-xl border border-hairline p-4 transition-colors hover:border-brand/40 hover:bg-surface"
                >
                  <div className="flex items-center justify-between">
                    <c.icon className="size-5 text-brand" />
                    <ArrowUpRight className="size-4 text-muted transition-colors group-hover:text-brand" />
                  </div>
                  <p className="mt-2 text-sm font-bold text-ink">{c.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-body">{c.body}</p>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <>
            <DocumentList documents={documents} />
            {Object.keys(requestLinks).length > 0 && (
              <div className="rounded-card border border-hairline bg-paper p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  From service requests
                </p>
                <div className="flex flex-wrap gap-2">
                  {documents
                    .filter((d) => requestLinks[String(d.document_id)])
                    .map((d) => {
                      const link = requestLinks[String(d.document_id)];
                      return (
                        <Link
                          key={d.document_id}
                          href={`/admin/requests/${link.requestId}`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 text-xs font-semibold text-body transition-colors hover:border-brand/40 hover:bg-surface"
                        >
                          <Table2 className="size-3.5 text-brand" />
                          {d.filename} → {link.requestNumber}
                        </Link>
                      );
                    })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
