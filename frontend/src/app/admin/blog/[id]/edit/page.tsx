import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getPost } from "@/lib/db/queries/posts";
import { listCategories } from "@/lib/db/queries/categories";
import { PostEditor } from "@/components/admin/blog/post-editor";
import type { PostInput } from "@/lib/blog-types";

export const dynamic = "force-dynamic";

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [p, categories] = await Promise.all([getPost(id), listCategories("blog")]);
  if (!p) notFound();

  const initial: PostInput = {
    id: p.id,
    slug: p.slug,
    title: p.title,
    tag: p.tag,
    excerpt: p.excerpt || "",
    coverImage: p.coverImage || "",
    author: p.author,
    body: p.body,
    status: p.status === "published" ? "published" : "draft",
    seoTitle: p.seoTitle || "",
    seoDescription: p.seoDescription || "",
  };

  return (
    <div className="space-y-5">
      <Link href="/admin/blog" className="inline-flex items-center gap-1.5 text-sm font-medium text-body hover:text-ink">
        <ArrowLeft className="size-4" /> Blog
      </Link>
      <h2 className="font-display text-lg font-bold text-ink">Edit post</h2>
      <PostEditor initial={initial} categories={categories} />
    </div>
  );
}
