"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2, Save, Send, ExternalLink, ImageIcon, UploadCloud, X } from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";
import { InsightBody } from "@/components/insights/insight-body";
import { RichTextEditor } from "@/components/admin/blog/rich-text-editor";
import { splitBody, estimateReadMins, slugify, mdSubsetToHtml } from "@/lib/insights-format";
import { savePostAction } from "@/app/admin/blog/actions";
import { uploadFile } from "@/lib/upload-client";
import type { PostInput } from "@/lib/blog-types";
import type { Category } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

const FALLBACK_TAGS = ["Taxation", "Modelling", "Reporting", "Analytics", "Advisory", "Forensics", "Insights"];

const inputCls =
  "w-full rounded-lg border border-hairline bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-brand";
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-body";

function fmtDate(d = new Date()) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** Single-image cover dropzone — uploads straight to R2 (same helper the app's
 *  uploader uses) so nobody has to paste an image URL. */
function CoverDropzone({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    try {
      onChange(await uploadFile(file, "cover"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  if (value) {
    return (
      <div className="group relative aspect-[16/9] overflow-hidden rounded-lg border border-hairline bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="Cover" className="size-full object-cover" />
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg bg-black/50 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
          aria-label="Remove cover image"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void upload(f);
      }}
      className={cn(
        "flex aspect-[16/9] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed text-center transition-colors",
        dragOver ? "border-brand bg-brand-tint/40" : "border-hairline bg-surface/40 hover:border-brand hover:bg-brand-tint/25",
      )}
    >
      {busy ? <Loader2 className="size-6 animate-spin text-brand" /> : <UploadCloud className="size-6 text-brand" />}
      <span className="text-sm font-medium text-ink">{busy ? "Uploading…" : "Drop a cover image, or click"}</span>
      <span className="text-xs text-muted">PNG, JPG or WEBP</span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}

export function PostEditor({ initial, categories = [] }: { initial?: PostInput; categories?: Category[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [slugEdited, setSlugEdited] = useState(!!initial?.id);

  const [form, setForm] = useState<PostInput>(
    initial
      ? { ...initial, body: mdSubsetToHtml(initial.body || "") } // legacy markdown → HTML for the WYSIWYG
      : {
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

  // The body is HTML now; strip tags for the reading estimate + preview split.
  const plain = useMemo(() => form.body.replace(/<[^>]+>/g, " "), [form.body]);
  const readMins = useMemo(() => estimateReadMins(plain), [plain]);
  const seoTitle = (form.seoTitle || form.title || "Untitled post").slice(0, 60);
  const seoDesc = (form.seoDescription || form.excerpt || "").slice(0, 160);

  const tagOptions = useMemo(() => {
    const names = categories.length ? categories.map((c) => c.name) : FALLBACK_TAGS;
    return Array.from(new Set([form.tag, ...names].filter(Boolean)));
  }, [categories, form.tag]);

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
              {tagOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Author</label>
          <input value={form.author} onChange={(e) => set("author", e.target.value)} placeholder="Litch Consulting" className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Cover image</label>
          <CoverDropzone value={form.coverImage || ""} onChange={(url) => set("coverImage", url)} />
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
            <span className="text-[11px] text-muted">{readMins} min read</span>
          </div>
          <RichTextEditor value={form.body} onChange={(html) => set("body", html)} />
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
            {plain.trim() ? (
              <InsightBody paragraphs={splitBody(form.body)} className="mt-2" />
            ) : (
              <p className="mt-6 text-sm italic text-muted">Start writing the body to see it rendered here…</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
