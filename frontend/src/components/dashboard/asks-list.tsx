"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileText, Loader2, MessageSquare, Upload } from "lucide-react";
import { Button, EmptyState, StatusChip } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { uploadRequestFile } from "@/lib/upload-client";
import { supplyItemAction } from "@/app/dashboard/requests/flow-actions";
import { cn } from "@/lib/utils";
import { REQUEST_DOC_ACCEPT } from "@/lib/upload-types";

export type AskItem = {
  id: string;
  kind: "info" | "document" | string;
  title: string;
  detail: string | null;
  status: string;
  dueAt: string | null;
  answer: string | null;
  suppliedAt: string | null;
  receivedAt: string | null;
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short" });
const ACCEPT = REQUEST_DOC_ACCEPT;

/** The client's asks: answer or upload in place, or say "I do not have it". */
export function AsksList({ requestId, items, who }: { requestId: string; items: AskItem[]; who: string }) {
  if (!items.length)
    return (
      <EmptyState
        compact
        icon={<CheckCircle2 />}
        title="We have not asked you for anything"
        why="If we need a document or an answer, it appears here with a due date, and you get an email."
      />
    );
  const open = items.filter((i) => i.status === "open");
  const rest = items.filter((i) => i.status !== "open");
  return (
    <ul className="space-y-3">
      {[...open, ...rest].map((it) => (
        <AskRow key={it.id} requestId={requestId} item={it} who={who} />
      ))}
    </ul>
  );
}

function AskRow({ requestId, item, who }: { requestId: string; item: AskItem; who: string }) {
  const toast = useToast();
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState<null | "send" | "none" | number>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isDoc = item.kind === "document";
  const isOpen = item.status === "open";
  const late = item.dueAt && new Date(item.dueAt).getTime() < Date.now();

  const send = async (payload: Parameters<typeof supplyItemAction>[0], mode: "send" | "none") => {
    setBusy(mode);
    setErr(null);
    const r = await supplyItemAction(payload);
    setBusy(null);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    toast.success(r.message ?? "Sent");
    router.refresh();
  };

  const upload = async (file: File) => {
    setErr(null);
    setBusy(0);
    try {
      const { key } = await uploadRequestFile(requestId, file, (p) => setBusy(p));
      await send({ itemId: item.id, requestId, document: { fileName: file.name, contentType: file.type || null, sizeBytes: file.size, r2Key: key } }, "send");
    } catch (e) {
      setBusy(null);
      setErr(e instanceof Error ? e.message : "The upload failed. Try again.");
    }
  };

  return (
    <li id={`item-${item.id}`} className={cn("scroll-mt-24 rounded-card border bg-paper p-4 sm:p-5", isOpen ? "border-line-strong" : "border-hairline")}>
      <div className="flex gap-3">
        <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-ctl", isOpen ? "bg-warn-soft text-warn" : "bg-good-soft text-good")}>
          {isOpen ? isDoc ? <FileText className="size-[18px]" /> : <MessageSquare className="size-[18px]" /> : <CheckCircle2 className="size-[18px]" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium text-ink">{item.title}</h3>
            <StatusChip domain="item" status={item.status} audience="client" size="sm" />
          </div>
          {item.detail ? <p className="mt-1 text-sm text-body">{item.detail}</p> : null}
          {isOpen && item.dueAt ? <p className={cn("mt-1 text-sm", late ? "font-medium text-bad" : "text-muted")}>{late ? "Was due" : "Due"} {fmt(item.dueAt)}</p> : null}
          {!isOpen ? (
            <p className="mt-1 text-sm text-muted">
              {item.answer ? `You answered: ${item.answer}` : isDoc ? "You sent the file." : "Answered."}
              {item.status === "supplied" ? ` ${who} will mark it received.` : item.receivedAt ? ` Received ${fmt(item.receivedAt)}.` : ""}
            </p>
          ) : null}
        </div>
      </div>

      {isOpen ? (
        <div className="mt-4 space-y-3 sm:pl-12">
          {isDoc ? (
            <>
              <input ref={fileRef} type="file" accept={ACCEPT} className="sr-only" id={`file-${item.id}`} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <label
                htmlFor={`file-${item.id}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) void upload(f);
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-ctl border border-dashed border-line-strong bg-surface px-4 py-4 text-sm hover:border-accent focus-within:ring-2 focus-within:ring-accent/40",
                  typeof busy === "number" && "pointer-events-none opacity-70",
                )}
              >
                {typeof busy === "number" ? <Loader2 className="size-5 animate-spin text-muted" aria-hidden /> : <Upload className="size-5 text-muted" aria-hidden />}
                <span>
                  <b className="block text-ink">{typeof busy === "number" ? `Uploading… ${busy}%` : "Drop the file here or choose one"}</b>
                  <span className="text-muted">Excel, CSV, PDF, Word or a photo, up to 25 MB</span>
                </span>
              </label>
            </>
          ) : (
            <div>
              <label htmlFor={`ans-${item.id}`} className="mb-1.5 block text-sm font-medium text-ink">
                Your answer
              </label>
              <textarea
                id={`ans-${item.id}`}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={3}
                maxLength={4000}
                className="w-full rounded-ctl border border-line-strong bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              <Button
                variant="primary"
                className="mt-2"
                disabled={!answer.trim() || busy !== null}
                onClick={() => send({ itemId: item.id, requestId, answer }, "send")}
              >
                {busy === "send" ? "Sending…" : "Send answer"}
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => send({ itemId: item.id, requestId, notAvailable: true, answer: answer || undefined }, "none")}
            >
              {busy === "none" ? "Sending…" : "I do not have it"}
            </Button>
          </div>
          {err ? (
            <p role="alert" className="text-sm text-bad">
              {err}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
