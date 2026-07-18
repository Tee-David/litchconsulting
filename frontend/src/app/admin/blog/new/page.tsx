import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PostEditor } from "@/components/admin/blog/post-editor";
import { listCategories } from "@/lib/db/queries/categories";

export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const categories = await listCategories("blog");
  return (
    <div className="space-y-5">
      <Link href="/admin/blog" className="inline-flex items-center gap-1.5 text-sm font-medium text-body hover:text-ink">
        <ArrowLeft className="size-4" /> Blog
      </Link>
      <h2 className="font-display text-lg font-bold text-ink">New post</h2>
      <PostEditor categories={categories} />
    </div>
  );
}
