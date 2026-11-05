import type { Metadata } from "next";
import { requireArea } from "@/lib/server-user";
import { roleOf } from "@/lib/access";
import { StartScreen } from "@/components/workbench/screens";

export const metadata: Metadata = { title: "Open in the workbench" };
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function StaffStartWorkbench({ searchParams }: { searchParams: Promise<{ requestId?: string }> }) {
  const { requestId } = await searchParams;
  const user = await requireArea("analyses", "/work/analyses/w/new");
  const rid = requestId && /^[0-9a-f-]{36}$/i.test(requestId) ? requestId : null;
  return <StartScreen requestId={rid} base="/work" isAdmin={roleOf(user) === "admin"} />;
}
