import Link from "next/link";
import { CalendarClock, Inbox, Plus } from "lucide-react";
import { requireArea } from "@/lib/server-user";
import { listConsultations } from "@/lib/db/queries/requests";
import { ActLink, PageHead } from "@/components/admin/ui/surface";
import { ConsultationsList } from "@/components/admin/requests/consultations-list";
import { RequestList } from "@/components/admin/requests/request-list";
import { listRequestRows, listTeam } from "../_lib/requests-data";

export const dynamic = "force-dynamic";

export default async function AdminRequestsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireArea("requestsAll", "/admin/requests");
  const { tab } = await searchParams;

  if (tab === "consultations") {
    const consultations = await listConsultations();
    return (
      <div>
        <PageHead
          title="Consultations"
          lede="Calls booked through Cal.com, matched to clients by email."
          actions={
            <ActLink href="/admin/requests" variant="secondary">
              <Inbox /> Back to requests
            </ActLink>
          }
        />
        <ConsultationsList rows={consultations} />
      </div>
    );
  }

  const [rows, team] = await Promise.all([listRequestRows(), listTeam()]);
  return (
    <div>
      <PageHead
        title="Requests"
        lede="Every piece of client work, with whose move it is and the next step."
        actions={
          <>
            <ActLink href="/admin/requests?tab=consultations" variant="secondary">
              <CalendarClock /> Consultations
            </ActLink>
            <ActLink href="/admin/services" variant="secondary">
              Service catalogue
            </ActLink>
            <ActLink href="/admin/requests/new">
              <Plus /> New request
            </ActLink>
          </>
        }
      />
      <RequestList rows={rows} team={team} />
      <p className="mt-4 text-xs text-muted">
        Push alerts for new requests moved to{" "}
        <Link href="/admin/notifications" className="text-accent hover:underline">
          notification settings
        </Link>
        .
      </p>
    </div>
  );
}
