"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Download, Lock, ShieldCheck, Trash2 } from "lucide-react";
import { Button, ConfirmSheet, Sheet } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { cancelErasureAction, eraseNowAction, scheduleErasureAction, setAiModeAction, type EraseReport } from "@/app/admin/clients/privacy-actions";
import { cn } from "@/lib/utils";

export function PrivacyPanel({
  clientId,
  name,
  aiMode,
  reason,
  setBy,
  setAt,
  erasureDueAt,
  counts,
}: {
  clientId: string;
  name: string;
  aiMode: string;
  reason: string | null;
  setBy: string | null;
  setAt: string | null;
  /** Set when erasure is scheduled: the day the sweep erases the data. */
  erasureDueAt: string | null;
  counts: { requests: number; files: number; tickets: number; invoices: number; payments: number };
}) {
  const toast = useToast();
  const router = useRouter();
  const [mode, setMode] = useState<"cloud_masked" | "local_only">(aiMode === "local_only" ? "local_only" : "cloud_masked");
  const [why, setWhy] = useState(reason ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [erase, setErase] = useState<"schedule" | "now" | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [report, setReport] = useState<EraseReport | null>(null);
  const dirty = mode !== aiMode || (mode === "local_only" && why !== (reason ?? ""));

  const due = erasureDueAt ? new Date(erasureDueAt) : null;
  const daysLeft = due ? Math.max(0, Math.ceil((due.getTime() - Date.now()) / 86_400_000)) : 0;
  const dueLabel = due ? due.toLocaleDateString("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "long", year: "numeric" }) : "";

  const cancelErasure = async () => {
    setCancelling(true);
    const r = await cancelErasureAction({ clientId });
    setCancelling(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message);
    router.refresh();
  };

  const save = async () => {
    setBusy(true);
    setErr(null);
    const r = await setAiModeAction({ clientId, mode, reason: why });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    toast.success(r.message);
    router.refresh();
  };

  const card = "rounded-card border border-hairline bg-paper p-4 sm:p-5";
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className={card}>
        <h2 className="font-display text-[15px] font-semibold text-ink">How AI handles this client</h2>
        <div className="mt-3 space-y-2" role="radiogroup" aria-label="AI mode">
          {(
            [
              ["cloud_masked", "Cloud, masked", "Schema, totals and masked samples go to the cloud models. Names, accounts and TINs become tokens first.", ShieldCheck],
              ["local_only", "Local only", "Everything stays on our own server with the local model. Slower. Use for NDAs, forensic work or when the client asks.", Lock],
            ] as const
          ).map(([v, label, text, Icon]) => (
            <label key={v} className={cn("flex cursor-pointer gap-3 rounded-ctl border p-3 text-sm", mode === v ? (v === "local_only" ? "border-violet bg-violet-soft" : "border-act bg-brand-tint") : "border-hairline hover:bg-surface")}>
              <input type="radio" name="ai-mode" checked={mode === v} onChange={() => setMode(v)} className="mt-1" />
              <span>
                <span className="flex items-center gap-1.5 font-semibold text-ink">
                  <Icon className="size-4" /> {label}
                </span>
                <span className="block text-body">{text}</span>
              </span>
            </label>
          ))}
        </div>
        {mode === "local_only" && (
          <label className="mt-3 block text-sm">
            <span className="mb-1.5 block font-medium text-ink">Reason (kept in the audit log)</span>
            <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Forensic engagement under NDA" className="h-10 w-full rounded-ctl border border-line-strong bg-paper px-3 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20" />
          </label>
        )}
        <p className="mt-3 text-xs text-muted">
          {setAt ? `Set ${new Date(setAt).toLocaleString("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric" })}${setBy ? ` by ${setBy}` : ""}${reason ? `. Reason: ${reason}` : ""}. ` : "Never changed. "}
          Applies to Sage, the workbench and help-desk triage for this client.
        </p>
        {err ? <p className="mt-2 text-sm text-bad">{err}</p> : null}
        <div className="mt-3 flex justify-end">
          <Button variant="primary" size="sm" onClick={save} disabled={!dirty || busy || (mode === "local_only" && why.trim().length < 3)}>
            {busy ? "Saving…" : "Save AI mode"}
          </Button>
        </div>
      </section>

      <section className={card}>
        <h2 className="font-display text-[15px] font-semibold text-ink">Data rights (NDPA 2023)</h2>
        <div className="mt-3 space-y-4 text-sm">
          <div className="flex gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-ctl bg-brand-tint text-brand">
              <Download className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-ink">Export everything</p>
              <p className="text-body">
                Profile, {counts.requests} requests, {counts.tickets} support tickets, {counts.invoices} invoices and quotes, {counts.payments} payments and links to {counts.files} files, in one JSON file with an index. File links work for 24 hours.
              </p>
              <a href={`/admin/clients/${clientId}/export`} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-ctl border border-line-strong px-2.5 text-[13px] font-medium text-ink hover:bg-surface" download>
                <Download className="size-4" /> Download export
              </a>
            </div>
          </div>
          <hr className="border-hairline" />
          <div className="flex gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-ctl bg-bad-soft text-bad">
              <Trash2 className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-ink">Erase this client</p>
              {due ? (
                <div className="mt-1.5 rounded-ctl border border-bad/30 bg-bad-soft p-3" role="status">
                  <p className="flex items-center gap-1.5 font-semibold text-bad">
                    <CalendarClock className="size-4" /> Erasure scheduled for {dueLabel}
                  </p>
                  <p className="mt-1 text-body">
                    {daysLeft === 0 ? "It runs with tonight's sweep." : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left to cancel.`} The client&rsquo;s portal is closed until then; nothing has been removed yet.
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={cancelErasure} disabled={cancelling}>
                      {cancelling ? "Cancelling…" : "Cancel erasure"}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setErase("now")} disabled={cancelling}>
                      Erase now…
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-body">
                    Removes people, messages, files, asks, notes, AI history and the portal login after a 30-day hold you can cancel. Invoices, quotes and payments stay for 6 years for tax law, with names and contacts removed.
                  </p>
                  <Button variant="danger" size="sm" className="mt-2" onClick={() => setErase("schedule")}>
                    Schedule erasure…
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <ConfirmSheet
        open={erase !== null}
        onClose={() => setErase(null)}
        title={erase === "now" ? `Erase ${name} now?` : `Schedule erasure of ${name}?`}
        tone="danger"
        confirmLabel={erase === "now" ? "Erase now" : "Schedule erasure"}
        typeToConfirm={`erase ${name}`}
        body={
          erase === "now" ? (
            <div className="space-y-2">
              <p>
                This skips the rest of the hold and permanently removes {counts.requests} requests with their {counts.files} files, {counts.tickets} support tickets, notes, consultations, AI chats about the client, and their portal login. It cannot be undone.
              </p>
              <p>
                Kept for tax law: {counts.invoices} invoices and quotes and {counts.payments} payments, with names, emails and addresses removed.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p>
                Nothing is removed today. The client is signed out and their portal closes. In 30 days the data is erased: {counts.requests} requests with their {counts.files} files, {counts.tickets} support tickets, notes, consultations, AI chats and the portal login.
              </p>
              <p>You can cancel any time before then. Export first if the client asked for a copy.</p>
              <p>
                Kept for tax law: {counts.invoices} invoices and quotes and {counts.payments} payments, with names, emails and addresses removed.
              </p>
            </div>
          )
        }
        onConfirm={async () => {
          if (erase === "now") {
            const r = await eraseNowAction({ clientId, confirm: `erase ${name}` });
            if (!r.ok) throw new Error(r.error);
            setReport(r.report);
          } else {
            const r = await scheduleErasureAction({ clientId, confirm: `erase ${name}` });
            if (!r.ok) throw new Error(r.error);
            toast.success(r.message);
            router.refresh();
          }
        }}
      />
      <Sheet
        open={report !== null}
        onClose={() => {
          setReport(null);
          router.push("/admin/clients");
        }}
        title="Erasure complete"
        description={name}
        footer={<Button variant="primary" onClick={() => router.push("/admin/clients")}>Back to clients</Button>}
      >
        {report && (
          <div className="space-y-4 text-sm">
            <div>
              <p className="mb-1 font-semibold text-ink">Removed</p>
              <ul className="space-y-0.5 text-body">
                {Object.entries(report.deleted).filter(([, n]) => n > 0).length === 0 ? <li>No personal records were found.</li> : null}
                {Object.entries(report.deleted)
                  .filter(([, n]) => n > 0)
                  .map(([k, n]) => (
                    <li key={k}>
                      {k}: {n}
                    </li>
                  ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 font-semibold text-ink">Kept (legally required, anonymised)</p>
              <ul className="space-y-0.5 text-body">
                {Object.entries(report.kept).map(([k, n]) => (
                  <li key={k}>
                    {k}: {n}
                  </li>
                ))}
              </ul>
            </div>
            {report.notes.length ? (
              <ul className="list-disc space-y-1 pl-5 text-body">
                {report.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
            <p className="text-muted">This report is saved in the audit log.</p>
          </div>
        )}
      </Sheet>
    </div>
  );
}
