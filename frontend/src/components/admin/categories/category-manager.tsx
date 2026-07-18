"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { Modal } from "@/components/admin/ui/modal";
import { useToast } from "@/components/admin/ui/toaster";
import type { Category } from "@/lib/db/schema";
import {
  createCategoryAction,
  renameCategoryAction,
  deleteCategoryAction,
} from "@/app/admin/categories/actions";

/** Create / rename / delete managed categories for a surface ('blog' | 'template').
 *  Rename cascades to existing content server-side; delete is refused while in use. */
export function CategoryManager({
  open,
  onClose,
  kind,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  kind: "blog" | "template";
  categories: Category[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  async function add() {
    const name = newName.trim();
    if (!name) return;
    setBusy("new");
    const res = await createCategoryAction(kind, name);
    setBusy(null);
    if (res.ok) {
      setNewName("");
      toast.success("Category added.");
      router.refresh();
    } else toast.error(res.error || "Could not add.");
  }

  async function saveRename(id: string) {
    const name = draft.trim();
    setRenamingId(null);
    if (!name) return;
    setBusy(id);
    const res = await renameCategoryAction(id, name);
    setBusy(null);
    if (res.ok) {
      toast.success("Renamed — existing items updated.");
      router.refresh();
    } else toast.error(res.error || "Could not rename.");
  }

  async function remove(id: string) {
    setBusy(id);
    const res = await deleteCategoryAction(id);
    setBusy(null);
    if (res.ok) {
      toast.success("Category deleted.");
      router.refresh();
    } else toast.error(res.error || "Could not delete.");
  }

  return (
    <Modal open={open} onClose={onClose} title="Manage categories" description="Rename to update every item using it; a category in use can't be deleted.">
      <div className="space-y-4">
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="New category name…"
            className="min-w-0 flex-1 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
          <button
            type="button"
            onClick={add}
            disabled={!newName.trim() || busy === "new"}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50 keep-brand"
          >
            {busy === "new" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
          </button>
        </div>

        {categories.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No categories yet.</p>
        ) : (
          <ul className="divide-y divide-hairline rounded-lg border border-hairline">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                {renamingId === c.id ? (
                  <>
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename(c.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="min-w-0 flex-1 rounded-md border border-brand bg-paper px-2 py-1 text-sm text-ink outline-none"
                    />
                    <button type="button" onClick={() => saveRename(c.id)} className="grid size-7 place-items-center rounded-md text-muted hover:text-brand" aria-label="Save">
                      <Check className="size-4" />
                    </button>
                    <button type="button" onClick={() => setRenamingId(null)} className="grid size-7 place-items-center rounded-md text-muted hover:text-ink" aria-label="Cancel">
                      <X className="size-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.name}</span>
                    {busy === c.id ? (
                      <Loader2 className="size-4 animate-spin text-muted" />
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(c.id);
                            setDraft(c.name);
                          }}
                          className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink"
                          aria-label={`Rename ${c.name}`}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(c.id)}
                          className="grid size-7 place-items-center rounded-md text-muted hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                          aria-label={`Delete ${c.name}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
