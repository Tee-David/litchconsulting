import { Logo } from "@/components/ui/logo";
import { SignOutButton } from "@/components/auth/sign-out-button";

// Placeholder admin dashboard — full CRM/documents/blog/analytics comes in Phases 5–6.
export default function AdminPage() {
  return (
    <>
      <header className="flex items-center justify-between border-b border-hairline bg-white px-6 py-4">
        <Logo />
        <SignOutButton />
      </header>

      <main className="container-page py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Admin</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink">Dashboard</h1>
        <p className="mt-3 max-w-xl text-body">
          Leads/CRM, client documents, accounting, blog and analytics will live here.
        </p>
      </main>
    </>
  );
}
