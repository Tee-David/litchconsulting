"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Sheet } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";
import { assignRequestsAction } from "@/app/admin/requests/work-actions";
import type { TeamMember } from "@/app/admin/_lib/requests-data";
import { cn } from "@/lib/utils";

/** Choose who works on one or more requests. Staff only ever see what they are assigned. */
export function AssignSheet({
  open,
  onClose,
  requestIds,
  label,
  team,
  current = [],
}: {
  open: boolean;
  onClose: () => void;
  requestIds: string[];
  label: string;
  team: TeamMember[];
  current?: string[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>(current);
  const [mode, setMode] = useState<"add" | "replace">(requestIds.length > 1 ? "add" : "replace");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setChosen(current);
      setErr(null);
      setMode(requestIds.length > 1 ? "add" : "replace");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const go = async () => {
    setBusy(true);
    setErr(null);
    const r = await assignRequestsAction({ requestIds, userIds: chosen, mode });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    toast.success(r.message);
    router.refresh();
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="sm"
      title="Assign"
      description={label}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={go} disabled={busy || chosen.length === 0}>
            {busy ? "Assigning…" : "Assign"}
          </Button>
        </>
      }
    >
      {team.length === 0 ? (
        <EmptyState compact title="Nobody to assign yet" why="Invite staff from Settings, Team and access. Admins can be assigned too." />
      ) : (
        <div className="space-y-4 text-sm">
          <ul className="space-y-1.5" role="group" aria-label="Team members">
            {team.map((m) => {
              const on = chosen.includes(m.id);
              return (
                <li key={m.id}>
                  <label className={cn("flex cursor-pointer items-center gap-3 rounded-ctl border p-2.5", on ? "border-act bg-brand-tint" : "border-hairline hover:bg-surface")}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setChosen((c) => (on ? c.filter((x) => x !== m.id) : [...c, m.id]))}
                      className="size-4 accent-[var(--color-act)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{m.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {m.role === "admin" ? "Admin" : "Staff"} · {m.email}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {requestIds.length > 1 && (
            <fieldset className="space-y-1.5">
              <legend className="mb-1 font-medium text-ink">Existing assignees</legend>
              <label className="flex items-center gap-2">
                <input type="radio" name="assign-mode" checked={mode === "add"} onChange={() => setMode("add")} /> Keep them, add these people
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="assign-mode" checked={mode === "replace"} onChange={() => setMode("replace")} /> Replace them with these people
              </label>
            </fieldset>
          )}
          <p className="text-muted">New assignees get a notification and an email. Staff then see these requests in their work list, without money amounts.</p>
          {err ? <p className="text-bad">{err}</p> : null}
        </div>
      )}
    </Sheet>
  );
}
