"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DatabaseBackup, Download, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";
import { formatDateTime } from "@/lib/format-date";
import { runBackupNowAction, getBackupDownloadUrlAction } from "./backups-actions";

export type BackupItem = { key: string; size: number; lastModified: string | null };

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Settings → Backups: run an on-demand snapshot and download recent ones. */
export function BackupsCard({
  backups,
  configured,
}: {
  backups: BackupItem[];
  configured: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [running, startRun] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  function backupNow() {
    startRun(async () => {
      const res = await runBackupNowAction();
      if (!res.ok) return toast.error(res.error || "Backup failed.");
      toast.success("Backup created.");
      router.refresh();
    });
  }

  async function download(key: string) {
    setBusyKey(key);
    const res = await getBackupDownloadUrlAction(key);
    setBusyKey(null);
    if (!res.ok || !res.url) return toast.error(res.error || "Could not create download link.");
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="rounded-card border border-hairline bg-paper p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-tint text-brand">
            <DatabaseBackup className="size-4.5" />
          </span>
          <div>
            <h3 className="font-display text-sm font-bold text-ink">Database backups</h3>
            <p className="mt-0.5 text-xs text-body">
              Daily automated snapshots of your business data, stored privately. Download any of them
              on demand.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={backupNow}
          disabled={running || !configured}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60 keep-brand"
        >
          {running ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Back up now
        </button>
      </div>

      {!configured ? (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3.5 py-3 text-sm text-amber-600 dark:text-amber-400">
          <ShieldAlert className="size-4 shrink-0" />
          Private storage isn&apos;t configured — backups can&apos;t be created or listed here yet.
        </div>
      ) : backups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-hairline px-3.5 py-6 text-center text-sm text-muted">
          No backups yet. Run one now, or wait for the daily job.
        </p>
      ) : (
        <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-hairline">
          {backups.map((b) => (
            <li key={b.key} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-mono text-xs text-ink">{b.key.split("/").pop()}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {b.lastModified ? formatDateTime(b.lastModified) : "—"} · {humanSize(b.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => download(b.key)}
                disabled={busyKey === b.key}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-hairline px-3.5 py-1.5 text-xs font-semibold text-body transition-colors hover:border-brand/40 hover:bg-surface disabled:opacity-50"
              >
                {busyKey === b.key ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                Download
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
