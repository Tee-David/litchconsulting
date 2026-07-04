import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server-user";
import { getClientForUser } from "@/lib/db/queries/clients";
import { recentClientNotifications } from "@/lib/db/queries/notifications";
import { ClientShell } from "@/components/client/client-shell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login?callbackUrl=/dashboard");
  }

  // Admin redirect
  if (user.role === "admin") {
    redirect("/admin");
  }

  // Get or link the client record
  const clientRow = await getClientForUser(user.id, user.email || "", user.name || undefined);

  // Fetch client notifications
  const notifications = await recentClientNotifications(clientRow.id);

  // Pass user matching ClientUser interface
  const clientUser = {
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
  };

  return (
    <ClientShell user={clientUser} notifications={notifications}>
      {children}
    </ClientShell>
  );
}
