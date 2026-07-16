"use client";

import { useState, useTransition } from "react";
import { CalendarDays, CheckSquare, Loader2, Plus, StickyNote, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/admin/ui/toaster";
import { formatDate, formatDateTime } from "@/lib/format-date";
import type { ClientNote } from "@/lib/db/schema";
import {
  addClientNoteAction,
  toggleClientNoteAction,
  deleteClientNoteAction,
} from "../actions";

/**
 * Notes & tasks rail on the client hub Overview: quick annotations and
 * to-dos with optional due dates (overdue tasks flag red).
 */
export function NotesRail({ clientId, notes }: { clientId: string; notes: ClientNote[] }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<"note" | "task">("note");
  const [body, setBody] = useState("");
  const [dueDate, setDueDate] = useState("");

  const today = new Date().toISOString().slice(0, 10);

  function add() {
    startTransition(async () => {
      const res = await addClientNoteAction({
        clientId,
        kind,
        body,
        dueDate: kind === "task" ? dueDate || null : null,
      });
      if (!res.ok) return toast.error(res.error || "Could not save");
      setBody("");
      setDueDate("");
      toast.success(kind === "task" ? "Task added" : "Note added");
    });
  }

  function toggle(noteId: string) {
    startTransition(async () => {
      const res = await toggleClientNoteAction(clientId, noteId);
      if (!res.ok) toast.error(res.error || "Could not update");
    });
  }

  function remove(noteId: string) {
    startTransition(async () => {
      const res = await deleteClientNoteAction(clientId, noteId);
      if (!res.ok) toast.error(res.error || "Could not delete");
    });
  }

  return (
    <div className="rounded-card border border-hairline bg-paper p-5">
      <h3 className="mb-3 font-display text-sm font-bold text-ink">Notes & tasks</h3>

      {/* Composer */}
      <div className="space-y-2">
        <div className="flex gap-1 rounded-full border border-hairline p-1">
          {(
            [
              { v: "note", label: "Note", icon: StickyNote },
              { v: "task", label: "Task", icon: CheckSquare },
            ] as const
          ).map((k) => (
            <button
              key={k.v}
              type="button"
              onClick={() => setKind(k.v)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                kind === k.v ? "bg-brand text-white keep-brand" : "text-muted hover:text-ink"
              )}
            >
              <k.icon className="size-3.5" /> {k.label}
            </button>
          ))}
        </div>
        <textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={kind === "task" ? "What needs doing?" : "Jot something about this client…"}
          className="w-full rounded-xl border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
        />
        {kind === "task" && (
          <label className="flex items-center gap-2 text-xs text-body">
            <CalendarDays className="size-3.5 text-muted" /> Due
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-lg border border-hairline bg-surface px-2 py-1 text-xs text-ink focus:border-brand focus:outline-none"
            />
          </label>
        )}
        <button
          type="button"
          onClick={add}
          disabled={pending || !body.trim()}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-hairline px-4 py-2 text-xs font-semibold text-body transition-colors hover:border-brand/40 hover:bg-surface disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Add {kind}
        </button>
      </div>

      {/* List */}
      {notes.length > 0 && (
        <ul className="mt-4 space-y-2.5 border-t border-hairline pt-4">
          {notes.map((n) => {
            const overdue = n.kind === "task" && !n.done && n.dueDate && n.dueDate < today;
            return (
              <li key={n.id} className="group flex items-start gap-2.5">
                {n.kind === "task" ? (
                  <input
                    type="checkbox"
                    checked={n.done}
                    onChange={() => toggle(n.id)}
                    className="mt-0.5 size-4 shrink-0 rounded border-hairline accent-[var(--color-brand)]"
                  />
                ) : (
                  <StickyNote className="mt-0.5 size-4 shrink-0 text-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm leading-snug",
                      n.done ? "text-muted line-through" : "text-ink"
                    )}
                  >
                    {n.body}
                  </p>
                  <p className={cn("mt-0.5 text-[11px]", overdue ? "font-semibold text-red-500" : "text-muted")}>
                    {n.kind === "task" && n.dueDate
                      ? `${overdue ? "Overdue — " : "Due "}${formatDate(n.dueDate)}`
                      : formatDateTime(n.createdAt)}
                    {n.authorName ? ` · ${n.authorName}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  className="grid size-6 shrink-0 place-items-center rounded-full text-muted opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                  title="Delete"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
