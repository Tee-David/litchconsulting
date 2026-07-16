"use client";

import { useState, useTransition } from "react";
import { RotateCcw, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatDateTime } from "@/lib/format-date";
import { restoreClients, purgeClients } from "../clients/actions";

type TrashedClient = { id: string; name: string; email: string | null; deletedAt: string };

/** Trash rows: restore (one click) or permanently delete (type-to-confirm). */
export function TrashList({ clients }: { clients: TrashedClient[] }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function restore(c: TrashedClient) {
    setBusyId(c.id);
    startTransition(async () => {
      const res = await restoreClients([c.id]);
      setBusyId(null);
      if (!res.ok) return toast.error(res.error || "Could not restore");
      toast.success(`${c.name} restored`);
    });
  }

  async function purge(c: TrashedClient) {
    const ok = await confirm({
      title: "Permanently delete this client?",
      description: `${c.name} will be gone for good — this cannot be undone. Invoices and requests that reference them are not deleted.`,
      confirmLabel: "Delete permanently",
      tone: "danger",
      typeToConfirm: c.name,
    });
    if (!ok) return;
    setBusyId(c.id);
    startTransition(async () => {
      const res = await purgeClients([c.id]);
      setBusyId(null);
      if (!res.ok) return toast.error(res.error || "Could not delete");
      toast.success("Permanently deleted");
    });
  }

  return (
    <div className="rounded-card border border-hairline bg-paper">
      <div className="border-b border-hairline px-5 py-4">
        <h3 className="font-display text-sm font-bold text-ink">Clients</h3>
        <p className="mt-0.5 text-xs text-muted">{clients.length} in Trash</p>
      </div>
      <ul className="divide-y divide-hairline">
        {clients.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{c.name}</p>
              <p className="mt-0.5 text-xs text-muted">
                {c.email || "no email"} · deleted {formatDateTime(c.deletedAt)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => restore(c)}
                disabled={pending && busyId === c.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3.5 py-1.5 text-xs font-semibold text-body transition-colors hover:border-brand/40 hover:bg-surface disabled:opacity-50"
              >
                {pending && busyId === c.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
                Restore
              </button>
              <button
                type="button"
                onClick={() => purge(c)}
                disabled={pending && busyId === c.id}
                aria-label={`Permanently delete ${c.name}`}
                className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                title="Delete permanently"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
