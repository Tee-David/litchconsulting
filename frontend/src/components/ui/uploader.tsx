"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud, CheckCircle2, AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes, fileTypeMeta } from "@/lib/files";
import { uploadRequestFile, uploadFile, type UploadKind } from "@/lib/upload-client";

/**
 * Unified upload experience used across admin + client: multi-file, drag-and-drop,
 * per-file progress, remove-before-submit. Uploads to R2 as files are added, then
 * a single Submit hands the stored refs to the caller's server action.
 *
 * `target` is the bucket guardrail — "request" goes to the ownership-checked
 * PRIVATE bucket (client financial docs / deliverables); "public" goes to the
 * PUBLIC bucket (branding, templates). A caller can't accidentally cross them.
 */

export type UploaderResult = { file: File; key?: string; url?: string };

type Target =
  | { kind: "request"; requestId: string }
  | { kind: "public"; uploadKind: UploadKind };

type Item = {
  id: string;
  file: File;
  status: "uploading" | "done" | "error";
  pct: number;
  error?: string;
  key?: string;
  url?: string;
};

export function Uploader({
  target,
  accept,
  maxBytes = 25 * 1024 * 1024,
  multiple = true,
  hint,
  submitLabel = "Submit files",
  onSubmit,
  onDone,
}: {
  target: Target;
  accept?: string;
  maxBytes?: number;
  multiple?: boolean;
  hint?: string;
  submitLabel?: string;
  onSubmit: (results: UploaderResult[]) => Promise<{ ok: boolean; error?: string }>;
  onDone?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const patch = (id: string, p: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));

  const startUpload = useCallback(
    async (item: Item) => {
      try {
        if (target.kind === "request") {
          const { key } = await uploadRequestFile(target.requestId, item.file, (pct) =>
            patch(item.id, { pct })
          );
          patch(item.id, { status: "done", pct: 100, key });
        } else {
          const url = await uploadFile(item.file, target.uploadKind, (pct) => patch(item.id, { pct }));
          patch(item.id, { status: "done", pct: 100, url });
        }
      } catch (e) {
        patch(item.id, { status: "error", error: e instanceof Error ? e.message : "Upload failed" });
      }
    },
    [target]
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      setFormError(null);
      const picked = Array.from(files);
      const chosen = multiple ? picked : picked.slice(0, 1);
      const next: Item[] = chosen.map((file) =>
        file.size > maxBytes
          ? {
              id: crypto.randomUUID(),
              file,
              status: "error" as const,
              pct: 0,
              error: `Larger than ${formatBytes(maxBytes)}`,
            }
          : { id: crypto.randomUUID(), file, status: "uploading" as const, pct: 0 }
      );
      setItems((prev) => (multiple ? [...prev, ...next] : next));
      next.filter((i) => i.status === "uploading").forEach((i) => void startUpload(i));
    },
    [multiple, maxBytes, startUpload]
  );

  const remove = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const uploaded = items.filter((i) => i.status === "done");
  const anyUploading = items.some((i) => i.status === "uploading");

  async function submit() {
    if (!uploaded.length || anyUploading) return;
    setSubmitting(true);
    setFormError(null);
    const res = await onSubmit(uploaded.map((i) => ({ file: i.file, key: i.key, url: i.url })));
    setSubmitting(false);
    if (res.ok) {
      setItems([]);
      onDone?.();
    } else {
      setFormError(res.error || "Could not save. Please try again.");
    }
  }

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          dragOver
            ? "border-brand bg-brand-tint/40"
            : "border-hairline bg-surface/40 hover:border-brand hover:bg-brand-tint/25"
        )}
      >
        <UploadCloud className="size-8 text-brand" />
        <span className="text-sm font-medium text-ink">
          Drag &amp; drop {multiple ? "files" : "a file"} here, or click to browse
        </span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* File rows */}
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it) => {
            const meta = fileTypeMeta(it.file.name);
            return (
              <li
                key={it.id}
                className="flex items-center gap-3 rounded-xl border border-hairline bg-paper px-3 py-2.5"
              >
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-lg"
                  style={{ backgroundColor: `${meta.color}18`, color: meta.color }}
                >
                  <meta.Icon className="size-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-ink">{it.file.name}</p>
                    <span className="shrink-0 text-xs text-muted">{formatBytes(it.file.size)}</span>
                  </div>
                  {it.status === "uploading" && (
                    <div className="relative mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-hairline">
                      {it.pct > 0 ? (
                        <div
                          className="h-full rounded-full bg-brand transition-[width] duration-200"
                          style={{ width: `${it.pct}%` }}
                        />
                      ) : (
                        /* no granular progress yet (relay path) — sweep a segment */
                        <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-brand animate-indeterminate-bar" />
                      )}
                    </div>
                  )}
                  {it.status === "done" && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-3.5" /> Ready
                    </p>
                  )}
                  {it.status === "error" && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                      <AlertTriangle className="size-3.5" /> {it.error}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(it.id)}
                  aria-label={`Remove ${it.file.name}`}
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                >
                  {it.status === "uploading" ? <X className="size-4" /> : <Trash2 className="size-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {formError && (
        <p className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="size-3.5" /> {formError}
        </p>
      )}

      {/* Submit */}
      {items.length > 0 && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-muted">
            {anyUploading
              ? "Uploading…"
              : `${uploaded.length} file${uploaded.length === 1 ? "" : "s"} ready`}
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={!uploaded.length || anyUploading || submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50 keep-brand"
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {submitLabel}
          </button>
        </div>
      )}
    </div>
  );
}
