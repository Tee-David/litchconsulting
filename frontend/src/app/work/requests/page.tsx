import type { Metadata } from "next";
import { PageHead } from "@/components/dashboard/ui";
import { StaffRequestsTable } from "@/components/work/requests-table";
import { requireArea } from "@/lib/server-user";
import { staffRequestRows } from "@/lib/requests/work";

export const metadata: Metadata = { title: "My requests" };
export const dynamic = "force-dynamic";

export default async function StaffRequestsPage() {
  const user = await requireArea("requests", "/work/requests");
  const rows = await staffRequestRows(user.id);
  return (
    <>
      <PageHead title="My requests" lede="Only requests assigned to you. Ask an admin to assign more." />
      <StaffRequestsTable rows={rows} />
    </>
  );
}
