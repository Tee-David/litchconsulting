/** Shared input shape for the blog editor + save action (client & server). */
export type PostInput = {
  id?: string;
  slug: string;
  title: string;
  tag: string;
  excerpt?: string;
  coverImage?: string;
  author?: string;
  body: string;
  status: "draft" | "published";
  seoTitle?: string;
  seoDescription?: string;
};
