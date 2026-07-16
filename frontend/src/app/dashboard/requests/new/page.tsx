import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server-user";
import { getCatalog } from "@/lib/services/catalog";
import { toStepperService } from "@/components/requests/stepper-utils";
import { NewRequestClient } from "./new-request-client";

export const dynamic = "force-dynamic";

/**
 * In-portal request flow. Handles three arrivals:
 * - ?resume=1  — the public stepper's draft is picked up from localStorage
 *   (post signup/verify round-trip) and lands on the review step.
 * - ?service=x — a service card deep-link; the stepper opens preselected.
 * - bare       — a service picker grid.
 */
export default async function NewRequestPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?redirect=/dashboard/requests/new");
  if (user.role === "admin") redirect("/admin/requests");

  const catalog = await getCatalog();
  return <NewRequestClient services={catalog.map(toStepperService)} />;
}
