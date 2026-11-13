"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { runRestoreTestAction, type RestoreTableResult } from "@/app/admin/settings/backups/restore-actions";
import { cn } from "@/lib/utils";

export type LastRestore = { at: string; pass: boolean; seconds?: number; error?: string; failed?: string[] } | null;

/** Settings → Backups: prove the newest backup restores, into a scratch database that is dropped afterwards. */
export function RestoreTestCard({ last, enabled }: { last: LastRestore; enabled: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [tables, setTables] = useState<RestoreTableResult[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setErr(null);
    setTables(null);
    const r = await runRestoreTestAction();
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      router.refresh();
      return;
    }
    setTables(r.tables);
    if (r.pass) toast.success(`Restore test passed: ${r.tables.length} tables in ${r.seconds}s.`);
    else toast.error("Restore test failed. See the tables below.");
    router.refresh();
  };

  return (
    <section className="rounded-card border border-hairline bg-paper p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-ctl", !last ? "bg-surface text-muted" : last.pass ? "bg-good-soft text-good" : "bg-bad-soft text-bad")}>
          {!last ? <RotateCcw className="size-5" /> : last.pass ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[15px] font-semibold text-ink">
            {!last ? "Restore test never run" : last.pass ? "Restore test passed" : "Restore test failed"}
            {last ? <span className="ml-2 text-sm font-normal text-muted">{new Date(last.at).toLocaleString("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span> : null}
          </h2>
          <p className="text-sm text-body">
            {last?.error
              ? last.error
              : last?.failed?.length
                ? `Row counts differ on ${last.failed.join(", ")}.`
                : "Restores the newest backup into a fresh scratch database with the real schema, checks every table's row count, then drops it. Production is never touched."}
          </p>
        </div>
        <Button onClick={run} disabled={busy || !enabled}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} {busy ? "Restoring…" : "Run restore test"}
        </Button>
      </div>
      {busy && <p className="mt-3 text-sm text-muted">This takes up to a minute. You can keep working in another tab.</p>}
      {err && <p className="mt-3 text-sm text-bad">{err}</p>}
      {tables && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1.5 font-medium">Table</th>
                <th className="py-1.5 text-right font-medium">In backup</th>
                <th className="py-1.5 text-right font-medium">Restored</th>
                <th className="py-1.5 text-right font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {tables.map((t) => (
                <tr key={t.table}>
                  <td className="py-1.5 font-mono text-xs text-ink">{t.table}</td>
                  <td className="py-1.5 text-right tabular-nums">{t.snapshot}</td>
                  <td className="py-1.5 text-right tabular-nums">{t.restored}</td>
                  <td className={cn("py-1.5 text-right font-medium", t.pass ? "text-good" : "text-bad")}>{t.pass ? "Match" : "Differs"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
