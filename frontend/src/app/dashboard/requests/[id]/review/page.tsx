import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StatusChip, EmptyState } from "@/components/kit";
import { PageHead, Panel, Callout, linkBtn } from "@/components/dashboard/ui";
import { FileLink } from "@/components/dashboard/file-link";
import { ReviewDecision } from "@/components/dashboard/review-decision";
import { getPortal, clientRequestDetail } from "@/lib/requests/portal";
import { INCLUDED_ROUNDS } from "@/lib/requests/review";
import { formatDate } from "@/lib/format-date";

export const metadata: Metadata = { title: "Review the draft" };
export const dynamic = "force-dynamic";

type Comment = { text?: string; anchor?: string };

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const portal = await getPortal();
  if (!portal) redirect("/login?redirect=/dashboard/requests");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await clientRequestDetail(id, portal.client.id);
  if (!d) notFound();
  const { request: req, rounds, documents, team } = d;
  const who = team[0]?.name ?? "The team";
  const current = rounds[0] ?? null;
  const pending = req.status === "client_review" && current && !current.decision;
  const draft = current?.documentId ? documents.find((x) => x.id === current.documentId) : null;
  const otherDrafts = documents.filter((x) => x.kind === "deliverable" && x.id !== draft?.id);
  const base = `/dashboard/requests/${req.id}`;

  return (
    <div>
      <PageHead
        crumbs={[{ href: "/dashboard/requests", label: "Requests" }, { href: base, label: req.number }, { label: current ? `Draft ${current.round}` : "Review" }]}
        title={current ? `Draft ${current.round}: ${req.serviceName}` : `Review: ${req.serviceName}`}
        chip={<StatusChip domain="request" status={req.status} audience="client" />}
        lede={current ? `Sent by ${who} on ${formatDate(current.sentAt)} · round ${current.round} of ${INCLUDED_ROUNDS} included` : undefined}
      />

      {!current ? (
        <Panel>
          <EmptyState title="No draft to review yet" why={`${who} sends a draft here when it is ready, and you get an email.`} action={<Link className={linkBtn.secondary} href={base}>Back to the request</Link>} />
        </Panel>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            <Panel title="The draft">
              {draft ? (
                <FileLink href={`/api/dashboard/files/${draft.id}`} name={draft.fileName} meta={`Draft · ${formatDate(draft.createdAt)} · open it, then decide on the right`} blocked={draft.scanStatus === "infected"} />
              ) : (
                <p className="text-sm text-body">The draft file is attached to the request. Open Files to download it.</p>
              )}
              {otherDrafts.length ? (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium text-accent">Earlier files from us ({otherDrafts.length})</summary>
                  <ul className="mt-2 space-y-2">
                    {otherDrafts.map((f) => (
                      <li key={f.id}>
                        <FileLink href={`/api/dashboard/files/${f.id}`} name={f.fileName} meta={`${f.stage === "draft" ? "Draft" : "Final"} · ${formatDate(f.createdAt)}`} />
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </Panel>
            {rounds.length > 1 || (current.decision && rounds.length) ? (
              <Panel title="Earlier rounds">
                <ul className="divide-y divide-hairline">
                  {rounds
                    .filter((r) => r.decision)
                    .map((r) => {
                      const cs = (Array.isArray(r.comments) ? r.comments : []) as Comment[];
                      return (
                        <li key={r.id} className="py-3 text-sm">
                          <p className="font-medium text-ink">
                            Round {r.round} · {r.decidedAt ? formatDate(r.decidedAt) : ""} · {r.decision === "approved" ? "you approved it" : "you asked for changes"}
                          </p>
                          {cs.length ? (
                            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-body">
                              {cs.map((c, i) => (
                                <li key={i}>{c.anchor ? <b className="text-ink">{c.anchor}: </b> : null}{c.text}</li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                </ul>
              </Panel>
            ) : null}
          </div>
          <aside>
            <Panel title="Your decision">
              {pending ? (
                <ReviewDecision requestId={req.id} round={current.round} included={INCLUDED_ROUNDS} who={who} />
              ) : current.decision === "approved" ? (
                <Callout tone="good" title="Approved">{who} prepares the final files. You get them in Files.</Callout>
              ) : current.decision === "changes" ? (
                <Callout tone="info" title="Changes sent">{who} is working on the next draft. It will appear here.</Callout>
              ) : (
                <p className="text-sm text-body">This draft is no longer open for review.</p>
              )}
            </Panel>
          </aside>
        </div>
      )}
    </div>
  );
}
