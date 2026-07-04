"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2, Save, Send, ExternalLink, ImageIcon } from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";
import { InsightBody } from "@/components/insights/insight-body";
import { splitBody, estimateReadMins, slugify } from "@/lib/insights-format";
import { savePostAction } from "@/app/admin/blog/actions";
import type { PostInput } from "@/lib/blog-types";
import { cn } from "@/lib/utils";

const TAGS = ["Taxation", "Modelling", "Reporting", "Analytics", "Advisory", "Forensics", "Insights"];

const inputCls =
  "w-full rounded-lg border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-brand";
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-body";

function fmtDate(d = new Date()) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function PostEditor({ initial }: { initial?: PostInput }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [slugEdited, setSlugEdited] = useState(!!initial?.id);

  const [form, setForm] = useState<PostInput>(
    initial ?? {
      slug: "",
      title: "",
      tag: "Insights",
      excerpt: "",
      coverImage: "",
      author: "Litch Consulting",
      body: "",
      status: "draft",
      seoTitle: "",
      seoDescription: "",
    },
  );

  const set = <K extends keyof PostInput>(k: K, v: PostInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  function onTitle(v: string) {
    setForm((f) => ({ ...f, title: v, slug: slugEdited ? f.slug : slugify(v) }));
  }

  const paragraphs = useMemo(() => splitBody(form.body), [form.body]);
  const readMins = useMemo(() => estimateReadMins(form.body), [form.body]);
  const seoTitle = (form.seoTitle || form.title || "Untitled post").slice(0, 60);
  const seoDesc = (form.seoDescription || form.excerpt || "").slice(0, 160);

  async function save(status: "draft" | "published") {
    if (!form.title.trim()) {
      toast.error("Add a title first.");
      return;
    }
    setBusy(status === "published" ? "publish" : "draft");
    const res = await savePostAction({ ...form, status });
    setBusy(null);
    if (res.ok) {
      toast.success(status === "published" ? "Post published." : "Draft saved.");
      router.push("/admin/blog");
      router.refresh();
    } else toast.error(res.error || "Could not save the post.");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ---- Form ---- */}
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => save("draft")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface disabled:opacity-60"
          >
            {busy === "draft" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save draft
          </button>
          <button
            type="button"
            onClick={() => save("published")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
          >
            {busy === "publish" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {form.status === "published" ? "Update & publish" : "Publish"}
          </button>
          {initial?.id && form.status === "published" && (
            <a
              href={`/insights/${form.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm font-medium text-body transition-colors hover:bg-surface hover:text-ink"
            >
              <ExternalLink className="size-4" /> View live
            </a>
          )}
        </div>

        <div>
          <label className={labelCls}>Title</label>
          <input value={form.title} onChange={(e) => onTitle(e.target.value)} placeholder="A clear, specific headline" className={cn(inputCls, "text-base font-semibold")} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>URL slug</label>
            <div className="flex items-center gap-1 rounded-lg border border-hairline bg-paper px-3 focus-within:border-brand">
              <span className="text-sm text-muted">/insights/</span>
              <input
                value={form.slug}
                onChange={(e) => {
                  setSlugEdited(true);
                  set("slug", slugify(e.target.value));
                }}
                placeholder="post-url"
                className="w-full border-0 bg-transparent py-2.5 text-sm text-ink outline-none placeholder:text-muted"
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <select value={form.tag} onChange={(e) => set("tag", e.target.value)} className={inputCls}>
              {TAGS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Author</label>
            <input value={form.author} onChange={(e) => set("author", e.target.value)} placeholder="Litch Consulting" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Cover image URL</label>
            <input value={form.coverImage} onChange={(e) => set("coverImage", e.target.value)} placeholder="https://…" className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Excerpt / summary</label>
          <textarea
            value={form.excerpt}
            onChange={(e) => set("excerpt", e.target.value)}
            rows={2}
            placeholder="One or two sentences that sell the read (also the default meta description)."
            className={cn(inputCls, "resize-y")}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className={labelCls + " mb-0"}>Body</label>
            <span className="text-[11px] text-muted">{readMins} min read · Markdown: ## heading, - bullet, **bold**</span>
          </div>
          <textarea
            value={form.body}
            onChange={(e) => set("body", e.target.value)}
            rows={16}
            placeholder={"Write the article. Separate paragraphs with a blank line.\n\n## A section heading\n\n- A bullet point\n- Another point\n\nUse **bold** for emphasis."}
            className={cn(inputCls, "resize-y font-mono text-[13px] leading-relaxed")}
          />
        </div>

        <div className="rounded-card border border-hairline bg-surface/40 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-body">Search / SEO</p>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>SEO title <span className="font-normal normal-case text-muted">({seoTitle.length}/60)</span></label>
              <input value={form.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} placeholder={form.title || "Defaults to the title"} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Meta description <span className="font-normal normal-case text-muted">({seoDesc.length}/160)</span></label>
              <textarea value={form.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} rows={2} placeholder={form.excerpt || "Defaults to the excerpt"} className={cn(inputCls, "resize-y")} />
            </div>
          </div>
        </div>
      </div>

      {/* ---- Live preview ---- */}
      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        {/* Google-style SERP snippet */}
        <div className="rounded-card border border-hairline bg-paper p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Search preview</p>
          <p className="truncate text-sm text-emerald-700 dark:text-emerald-400">litchconsulting.com › insights › {form.slug || "post-url"}</p>
          <p className="mt-0.5 truncate text-lg text-[#1a0dab] dark:text-[#8ab4f8]">{seoTitle}</p>
          <p className="mt-0.5 line-clamp-2 text-sm text-body">{seoDesc || "Add an excerpt or meta description to control this snippet."}</p>
        </div>

        {/* Article preview */}
        <div className="overflow-hidden rounded-card border border-hairline bg-paper">
          <div className="relative aspect-[16/9] bg-surface">
            {form.coverImage ? (
              <Image src={form.coverImage} alt="" fill sizes="50vw" className="object-cover" unoptimized />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-1 text-muted">
                <ImageIcon className="size-6" />
                <span className="text-xs">Cover image</span>
              </div>
            )}
          </div>
          <div className="p-6">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">{form.tag}</span>
            <h1 className="mt-2 font-display text-2xl font-bold leading-tight tracking-tight text-ink text-balance">
              {form.title || "Your headline appears here"}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-b border-hairline pb-5 text-sm text-muted">
              <span className="font-semibold text-ink">{form.author || "Litch Consulting"}</span>
              <span>·</span>
              <span>{fmtDate()}</span>
              <span>·</span>
              <span>{readMins} min read</span>
              <span
                className={cn(
                  "ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
                  form.status === "published" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                )}
              >
                {form.status}
              </span>
            </div>
            {form.excerpt && <p className="mt-5 text-lg leading-relaxed text-ink text-pretty">{form.excerpt}</p>}
            {paragraphs.length > 0 ? (
              <InsightBody paragraphs={paragraphs} />
            ) : (
              <p className="mt-6 text-sm italic text-muted">Start writing the body to see it rendered here…</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
