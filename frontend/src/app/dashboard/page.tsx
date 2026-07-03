import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/server-user";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Logo } from "@/components/ui/logo";

export const dynamic = "force-dynamic";

// Placeholder client portal — the full document/booking portal is built in Phase 5.
export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?redirect=/dashboard");
  // Admins get the full admin dashboard, not the client portal.
  if (user.role === "admin") redirect("/admin");

  return (
    <div className="min-h-screen bg-cloud">
      <header className="flex items-center justify-between border-b border-hairline bg-white px-6 py-4">
        <Logo />
        <div className="flex items-center gap-3">
          {user.role === "admin" && (
            <Link href="/admin" className="text-sm font-semibold text-brand hover:underline">
              Admin
            </Link>
          )}
          <SignOutButton />
        </div>
      </header>

      <main className="container-page py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Client portal</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink">
          Welcome, {user.name?.split(" ")[0] || "there"}.
        </h1>
        <p className="mt-3 max-w-xl text-body">
          Your secure document portal and booking history will live here. This area is coming together —
          check back soon.
        </p>
      </main>
    </div>
  );
}
