"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Mail,
  Merge,
  MoreHorizontal,
  ShieldAlert,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/admin/ui/toaster";
import { Modal } from "@/components/admin/ui/modal";
import { formatDate } from "@/lib/format-date";
import {
  inviteClientToPortalAction,
  mergeClientsAction,
  eraseClientAiDataAction,
} from "../actions";

export type DuplicateOption = {
  id: string;
  name: string;
  company: string | null;
  hasAccount: boolean;
  createdAt: string; // ISO
};

/**
 * Overflow actions on the client hub header: portal invite (no-account
 * clients), duplicate merge, and NDPA erase of AI-pipeline data.
 */
export function ClientQuickActions({
  clientId,
  clientName,
  canInvite,
  duplicates,
  aiConfigured,
}: {
  clientId: string;
  clientName: string;
  canInvite: boolean;
  duplicates: DuplicateOption[];
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [dupeId, setDupeId] = useState(duplicates[0]?.id ?? "");
  const [confirmName, setConfirmName] = useState("");
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const hasAnything = canInvite || duplicates.length > 0 || aiConfigured;
  if (!hasAnything) return null;

  function invite() {
    setOpen(false);
    startTransition(async () => {
      const res = await inviteClientToPortalAction(clientId);
      if (res.ok) toast.success("Portal invitation sent");
      else toast.error(res.error || "Could not send invite");
    });
  }

  function merge() {
    if (!dupeId) return;
    startTransition(async () => {
      const res = await mergeClientsAction(clientId, dupeId);
      if (!res.ok) return toast.error(res.error || "Merge failed");
      toast.success("Records merged");
      setMergeOpen(false);
      router.refresh();
    });
  }

  function erase() {
    startTransition(async () => {
      const res = await eraseClientAiDataAction(clientId);
      if (!res.ok) return toast.error(res.error || "Erase failed");
      toast.success("AI-pipeline data erased on the backend");
      setEraseOpen(false);
    });
  }

  const itemCls =
    "flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-body transition-colors hover:bg-surface hover:text-ink";

  return (
    <>
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="grid size-9 place-items-center rounded-full border border-hairline text-body transition-colors hover:bg-surface"
          title="More actions"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
        </button>
        {open && (
          <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-2xl border border-hairline bg-paper py-1 shadow-xl shadow-black/10">
            {canInvite && (
              <button type="button" onClick={invite} className={itemCls}>
                <UserPlus className="size-4 text-brand" /> Invite to client portal
              </button>
            )}
            {duplicates.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setMergeOpen(true);
                }}
                className={itemCls}
              >
                <Merge className="size-4 text-amber-500" /> Merge duplicate record
                {duplicates.length > 1 ? "s" : ""} ({duplicates.length})
              </button>
            )}
            {aiConfigured && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setConfirmName("");
                  setEraseOpen(true);
                }}
                className={cn(itemCls, "text-red-500 hover:text-red-500")}
              >
                <ShieldAlert className="size-4" /> Erase AI data (NDPA)
              </button>
            )}
          </div>
        )}
      </div>

      {/* Merge modal */}
      <Modal open={mergeOpen} onClose={() => setMergeOpen(false)} title="Merge duplicate record">
        <div className="space-y-4">
          <p className="text-sm text-body">
            Everything on the duplicate — invoices, requests, payments, tickets, consultations,
            notes — moves onto <span className="font-semibold text-ink">{clientName}</span>, then
            the duplicate is deleted. This can&apos;t be undone.
          </p>
          <div className="space-y-2">
            {duplicates.map((d) => (
              <label
                key={d.id}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm transition-colors",
                  dupeId === d.id ? "border-brand bg-brand-tint/40" : "border-hairline hover:bg-surface"
                )}
              >
                <span className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="dupe"
                    checked={dupeId === d.id}
                    onChange={() => setDupeId(d.id)}
                    className="size-4 accent-[var(--color-brand)]"
                  />
                  <span>
                    <span className="font-semibold text-ink">{d.company || d.name}</span>
                    <span className="block text-xs text-muted">
                      Created {formatDate(d.createdAt)}
                      {d.hasAccount ? " · has portal login" : ""}
                    </span>
                  </span>
                </span>
              </label>
            ))}
          </div>
          {duplicates.find((d) => d.id === dupeId)?.hasAccount && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-body">
              The duplicate has the portal login — its account will be linked to this surviving
              record after the merge.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMergeOpen(false)}
              className="rounded-full border border-hairline px-4 py-2 text-sm font-semibold text-body hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={merge}
              disabled={pending || !dupeId}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50 keep-brand"
            >
              {pending && <Loader2 className="size-4 animate-spin" />} Merge records
            </button>
          </div>
        </div>
      </Modal>

      {/* Erase modal */}
      <Modal open={eraseOpen} onClose={() => setEraseOpen(false)} title="Erase AI-pipeline data">
        <div className="space-y-4">
          <p className="text-sm text-body">
            Permanently deletes this client&apos;s documents, extracted line items, engagements and
            client-scoped learning memory from the LitchAI backend (NDPA erasure). Portal records —
            invoices, requests, tickets — are untouched.
          </p>
          <label className="block text-sm text-body">
            Type <span className="font-semibold text-ink">{clientName}</span> to confirm:
            <input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEraseOpen(false)}
              className="rounded-full border border-hairline px-4 py-2 text-sm font-semibold text-body hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={erase}
              disabled={pending || confirmName.trim() !== clientName.trim()}
              className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {pending && <Loader2 className="size-4 animate-spin" />} Erase permanently
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
