import type { Metadata } from "next";
import { requireArea } from "@/lib/server-user";
import { WorkbenchScreen } from "@/components/workbench/screens";

export const metadata: Metadata = { title: "Workbench" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function AdminWorkbenchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireArea("analyses", `/admin/analyses/w/${id}`);
  return <WorkbenchScreen id={id} base="/admin" />;
}
