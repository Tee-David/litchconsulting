import { redirect } from "next/navigation";

/** The old billing list moved to /dashboard/billing (kept so old links work). */
export default function OldInvoicesPage() {
  redirect("/dashboard/billing");
}
