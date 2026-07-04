"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { PenLine, Trash2, ExternalLink, Eye, EyeOff, Loader2, Search, FileText } from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";
import { setPostStatusAction, deletePostAction } from "@/app/admin/blog/actions";
import type { PostRow } from "@/lib/db/queries/posts";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "published", label: "Published" },
  { key: "draft", label: "Drafts" },
] as const;

function fmtDate(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function PostList({ posts }: { posts: PostRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return posts.filter((p) => {
      if (filter !== "all" && p.status !== filter) return false;
      if (needle && !`${p.title} ${p.tag} ${p.slug}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [posts, filter, q]);

  const counts = {
    all: posts.length,
    published: posts.filter((p) => p.status === "published").length,
    draft: posts.filter((p) => p.status === "draft").length,
  };

  async function toggle(p: PostRow) {
    setBusy(p.id);
    const res = await setPostStatusAction(p.id, p.status === "published" ? "draft" : "published");
    setBusy(null);
    if (res.ok) {
      toast.success(p.status === "published" ? "Moved to drafts." : "Published.");
      router.refresh();
    } else toast.error(res.error || "Action failed.");
  }

  async function remove(p: PostRow) {
    if (!confirm(`Delete “${p.title}”? This cannot be undone.`)) return;
    setBusy(p.id);
    const res = await deletePostAction(p.id);
    setBusy(null);
    if (res.ok) {
      toast.success("Post deleted.");
      router.refresh();
    } else toast.error(res.error || "Could not delete.");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-lg border border-hairline bg-paper p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                filter === f.key ? "bg-brand text-white dark:bg-highlight dark:text-ink" : "text-body hover:text-ink",
              )}
            >
              {f.label} <span className="ml-0.5 text-xs opacity-70">{counts[f.key as keyof typeof counts]}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search posts…"
            className="h-9 w-full rounded-lg border border-hairline bg-paper pl-9 pr-3 text-sm text-ink outline-none focus:border-brand"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-hairline bg-paper px-6 py-16 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-brand-tint text-brand">
            <FileText className="size-6" />
          </div>
          <h3 className="font-display text-lg font-semibold text-ink">{posts.length === 0 ? "No posts yet" : "No matches"}</h3>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-body">
            {posts.length === 0 ? "Write your first insight — it publishes straight to your public Insights page." : "Try a different search or filter."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-hairline bg-paper">
          <div className="divide-y divide-hairline">
            {rows.map((p) => (
              <div key={p.id} className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface/50">
                <div className="relative hidden size-14 shrink-0 overflow-hidden rounded-lg bg-surface sm:block">
                  {p.coverImage ? (
                    <Image src={p.coverImage} alt="" fill sizes="56px" className="object-cover" unoptimized />
                  ) : (
                    <div className="grid size-full place-items-center text-muted">
                      <FileText className="size-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-brand">{p.tag}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
                        p.status === "published" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {p.status}
                    </span>
                  </div>
                  <Link href={`/admin/blog/${p.id}/edit`} className="mt-0.5 block truncate font-display text-sm font-bold text-ink hover:text-brand">
                    {p.title}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    /{p.slug} · {p.status === "published" ? `Published ${fmtDate(p.publishedAt)}` : `Updated ${fmtDate(p.updatedAt)}`} · {p.readMins} min
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {p.status === "published" && (
                    <a href={`/insights/${p.slug}`} target="_blank" rel="noopener noreferrer" className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink" aria-label="View live">
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                  <button type="button" onClick={() => toggle(p)} disabled={busy === p.id} className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink" aria-label={p.status === "published" ? "Unpublish" : "Publish"}>
                    {busy === p.id ? <Loader2 className="size-4 animate-spin" /> : p.status === "published" ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                  <Link href={`/admin/blog/${p.id}/edit`} className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink" aria-label="Edit">
                    <PenLine className="size-4" />
                  </Link>
                  <button type="button" onClick={() => remove(p)} disabled={busy === p.id} className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger" aria-label="Delete">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
