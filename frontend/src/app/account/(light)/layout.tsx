import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAccountUser, twoStepState } from "@/lib/server-user";
import { homeFor, roleOf, ROLE_LABEL } from "@/lib/access";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SignOutButton } from "@/components/auth/sign-out-button";

export const dynamic = "force-dynamic";

/**
 * /account/* — the same for every role (profile and security, welcome, the
 * two-step steps). A light frame of its own rather than a dashboard shell, so
 * it also works while a firm account is held at two-step and the workspace is
 * closed to it. Signed-out visitors go to sign in.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const u = await getAccountUser();
  if (!u) redirect("/login?redirect=/account/security");
  const role = roleOf(u);
  const held = (await twoStepState()) !== "ok";
  const home = homeFor(role);

  return (
    <div className="min-h-dvh bg-desk">
      <header className="sticky top-0 z-30 border-b border-hairline bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={held ? "/account/two-step" : home} aria-label="Litch Consulting" className="shrink-0 rounded-ctl outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
              <Logo className="h-8" />
            </Link>
            {!held ? (
              <Link href={home} className="hidden items-center gap-1 rounded-ctl px-2 py-1.5 text-sm font-medium text-muted hover:bg-surface hover:text-ink sm:inline-flex">
                <ArrowLeft className="size-4" aria-hidden /> Back to {role === "client" ? "my dashboard" : role === "staff" ? "my work" : "Admin"}
              </Link>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-right text-[13px] leading-tight sm:block">
              <span className="block font-medium text-ink">{u.name || u.email}</span>
              <span className="text-muted">{ROLE_LABEL[role]}</span>
            </span>
            <ThemeToggle />
            <SignOutButton className="inline-flex h-9 items-center rounded-ctl border border-line-strong bg-paper px-3 text-sm font-medium text-ink hover:bg-surface" />
          </div>
        </div>
      </header>
      {!held ? (
        <div className="border-b border-hairline bg-paper sm:hidden">
          <Link href={home} className="mx-auto flex h-11 max-w-5xl items-center gap-1 px-4 text-sm font-medium text-muted">
            <ArrowLeft className="size-4" aria-hidden /> Back
          </Link>
        </div>
      ) : null}
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
