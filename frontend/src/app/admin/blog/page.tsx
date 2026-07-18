import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/ui/page-header";
import { listPosts } from "@/lib/db/queries/posts";
import { listCategories } from "@/lib/db/queries/categories";
import { PostList } from "@/components/admin/blog/post-list";

export const dynamic = "force-dynamic";

export default async function BlogPage() {
  const [posts, categories] = await Promise.all([listPosts(), listCategories("blog")]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Blog" description="Write, manage and publish SEO-optimised Insights articles." />
        <Link
          href="/admin/blog/new"
          data-tour="new-post"
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          <Plus className="size-4" /> New post
        </Link>
      </div>
      <div data-tour="posts-list">
        <PostList posts={posts} categories={categories} />
      </div>
    </div>
  );
}
