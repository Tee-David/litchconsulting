import type { ReactNode } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

/**
 * Auth layout (R1.1): the form on the left, on cloud, with the logo and a way
 * back to the site; a navy panel on the right that says what this step leads
 * to. The panel is context, not decoration, so each page passes its own; it
 * hides under 900px and the form becomes one column with 44px controls.
 */
export function AuthShell({ children, side }: { children: ReactNode; side?: ReactNode }) {
  return (
    <div className="grid min-h-dvh w-full bg-cloud min-[900px]:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-w-0 flex-col px-4 pb-12 pt-5 sm:px-10">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" aria-label="Litch Consulting home" className="rounded-ctl outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
            <Logo className="h-9" />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-[13px] font-medium text-muted hover:text-ink">
              litchconsulting.com
            </Link>
            <ThemeToggle />
          </div>
        </div>
        <main className="mx-auto mt-10 flex w-full max-w-[420px] flex-1 flex-col gap-5 sm:mt-16">{children}</main>
      </div>
      <aside
        aria-label="About this step"
        className="keep-brand relative hidden overflow-hidden bg-brand px-8 py-10 text-white min-[900px]:flex min-[900px]:flex-col"
      >
        {/* The Litch mark, faint, bottom-right: masked so it takes the panel's white. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-20 -right-20 size-[300px] bg-white/[0.06]"
          style={{
            WebkitMaskImage: "url(/brand/litch-mark.svg)",
            maskImage: "url(/brand/litch-mark.svg)",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskSize: "contain",
            maskSize: "contain",
          }}
        />
        <div className="relative flex flex-1 flex-col gap-5">{side ?? <ClientSide />}</div>
      </aside>
    </div>
  );
}

/** Panel copy blocks. Kept here so every auth page reads as one product. */
export function SideList({ title, items, foot }: { title: string; items: string[]; foot?: string }) {
  return (
    <>
      <h2 className="font-display text-xl font-semibold text-white">{title}</h2>
      <ul className="space-y-3">
        {items.map((t) => (
          <li key={t} className="flex gap-2.5 text-[14px] leading-relaxed text-white/75">
            <Check className="mt-1 size-4 shrink-0 text-highlight" aria-hidden />
            {t}
          </li>
        ))}
      </ul>
      {foot ? <p className="mt-auto text-[12.5px] leading-relaxed text-white/75">{foot}</p> : null}
    </>
  );
}

export function ClientSide() {
  return (
    <SideList
      title="Your finance work, in one place"
      items={["See every request, quote and invoice", "Upload documents securely", "Review drafts and approve in one click", "Pay by card, transfer or deposit"]}
      foot="Litch Consulting · Financial reporting, tax, modelling, forensic accounting and advisory."
    />
  );
}

export function StepsSide() {
  return (
    <>
      <h2 className="font-display text-xl font-semibold text-white">How it works</h2>
      <ol className="space-y-3">
        {[
          "Choose a service and tell us about it",
          "Get a quote and accept it in one click",
          "Pay in full or a 50% deposit",
          "Upload what we ask for",
          "Review the draft, then receive the final",
        ].map((t, i) => (
          <li key={t} className="flex gap-3 text-[14px] leading-relaxed text-white/75">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 font-display text-[12px] font-semibold text-white">{i + 1}</span>
            {t}
          </li>
        ))}
      </ol>
      <p className="mt-auto text-[12.5px] leading-relaxed text-white/75">Not sure which service you need? Book a free call from the services page.</p>
    </>
  );
}

export function StaffSide() {
  return (
    <SideList
      title="Welcome to the team"
      items={[
        "You see the requests assigned to you, their files and the client's messages",
        "Billing, settings and the team list stay with Admin",
        "Two-step sign-in protects every firm account",
      ]}
      foot="Only Admin can invite staff. Every invitation is in the audit log."
    />
  );
}
