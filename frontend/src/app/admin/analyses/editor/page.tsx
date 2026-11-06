import { redirect } from "next/navigation";

/**
 * The old in-browser spreadsheet editor is replaced by the workbench (grid,
 * versions, proposals and Sage). Old links open the workbench start page for
 * the same request.
 */
export default async function OldEditorPage({ searchParams }: { searchParams: Promise<{ requestId?: string }> }) {
  const { requestId } = await searchParams;
  redirect(requestId && /^[0-9a-f-]{36}$/i.test(requestId) ? `/admin/analyses/w/new?requestId=${requestId}` : "/admin/analyses/w/new");
}
