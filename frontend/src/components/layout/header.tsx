"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, LayoutDashboard } from "lucide-react";
import { Logo, LogoMark } from "@/components/ui/logo";
import { Button } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { CalculatorButton } from "@/components/calculators/calculator-launcher";
import StaggeredMenu from "@/components/ui/StaggeredMenu";
import { useSession, signOut } from "@/lib/auth-client";
import { site } from "@/lib/content";
import { cn } from "@/lib/utils";

type SessionUserLite = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string | null;
};

function initialsOf(name?: string | null, email?: string | null) {
  const src = (name || email || "").trim();
  if (!src) return "U";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

/** Signed-in avatar (image or initials) with a small dropdown. */
function AccountMenu({ user }: { user: SessionUserLite }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dashHref = user.role === "admin" ? "/admin" : "/dashboard";

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}
        className="grid size-11 place-items-center overflow-hidden rounded-full bg-brand text-sm font-semibold text-white ring-2 ring-white/30 transition-transform hover:scale-105 active:scale-95"
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="size-full object-cover" />
        ) : (
          initialsOf(user.name, user.email)
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-hairline bg-paper p-1.5 shadow-xl shadow-black/10">
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-ink">{user.name || "Account"}</p>
            {user.email && <p className="truncate text-xs text-muted">{user.email}</p>}
          </div>
          <div className="my-1 h-px bg-hairline" />
          <Link
            href={dashHref}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface"
          >
            <LayoutDashboard className="size-4 text-brand" />
            {user.role === "admin" ? "Admin dashboard" : "Dashboard"}
          </Link>
          <button
            type="button"
            onClick={() => void signOut().then(() => (window.location.href = "/"))}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface"
          >
            <LogOut className="size-4 text-brand" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * `overlay` = the header sits transparent over a dark hero (home page). After
 * scrolling past the hero it becomes the glassy pill (and the full logo
 * collapses to the emblem). On pages with no hero it's always solid.
 */
export function Header({ overlay = false }: { overlay?: boolean }) {
  const pathname = usePathname();
  const [solid, setSolid] = useState(!overlay);
  const { data: session } = useSession();
  const user = session?.user as SessionUserLite | undefined;

  useEffect(() => {
    if (!overlay) return; // initial state is already solid without a hero
    // Solidify only after the hero is scrolled past. Inner pages use a shorter
    // hero than the home page, so measure the actual [data-hero] element rather
    // than assuming a full viewport.
    const hero = document.querySelector<HTMLElement>("[data-hero]");
    const thresholdOf = () => (hero ? hero.offsetHeight : window.innerHeight) - 80;
    let threshold = thresholdOf();
    const onScroll = () => setSolid(window.scrollY > threshold);
    const onResize = () => {
      threshold = thresholdOf();
      onScroll();
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [overlay]);

  const mobileItems = [
    ...site.nav.map((n) => ({ label: n.label, link: n.href, ariaLabel: n.label })),
    { label: "Calculators", link: "/calculators", ariaLabel: "Financial calculators" },
  ];

  const mobileActions = user
    ? [
        {
          label: user.role === "admin" ? "Admin dashboard" : "Dashboard",
          link: user.role === "admin" ? "/admin" : "/dashboard",
          variant: "primary" as const,
        },
        {
          label: "Sign out",
          onClick: () => void signOut().then(() => (window.location.href = "/")),
          variant: "outline" as const,
        },
      ]
    : [
        { label: "Sign in", link: "/login", variant: "outline" as const },
        { label: "Sign up", link: "/signup", variant: "primary" as const },
      ];

  return (
    <header>
      {/* Desktop bar */}
      <div className="fixed inset-x-0 top-0 z-50 hidden md:block">
        <div className="mx-auto max-w-[1400px] px-4">
          <div
            className={cn(
              "mt-3 flex items-center justify-between rounded-full px-6 py-2.5 transition-all duration-300",
              solid
                ? "border border-hairline/25 bg-paper/10 shadow-sm shadow-black/5 backdrop-blur-sm backdrop-saturate-150 supports-[backdrop-filter]:bg-paper/5 dark:border-white/10 dark:bg-night/15 dark:supports-[backdrop-filter]:bg-night/10"
                : "bg-transparent",
            )}
          >
            <Link href="/" aria-label="Litch Consulting home" className="flex items-center">
              {solid ? (
                <LogoMark tone="dark" className="h-14" />
              ) : (
                <Logo tone="light" className="h-14" />
              )}
            </Link>

            <nav className="flex items-center gap-9">
              {site.nav.map((item) => {
                const isActive =
                  item.href === "/" ? pathname === "/" : pathname.startsWith(item.href.split("#")[0]);
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "text-sm font-medium underline-offset-8 transition-colors",
                      isActive ? "underline decoration-2" : "link-underline",
                      solid
                        ? isActive
                          ? "text-brand dark:text-white dark:decoration-white"
                          : "text-ink hover:text-brand dark:text-white/80 dark:hover:text-white dark:hover:decoration-white"
                        : "text-shadow-soft " + (isActive ? "text-white" : "text-white/90 hover:text-white"),
                    )}
                  >
                    {item.label}
                  </a>
                );
              })}
            </nav>

            <div className="flex items-center gap-3">
              <CalculatorButton tone={solid ? "dark" : "light"} />
              <ThemeToggle />
              {user ? (
                <AccountMenu user={user} />
              ) : (
                <Button href="/login" withArrow variant="primary">
                  Log in
                </Button>
              )}
              <Button href="/book" withArrow variant={solid ? "outline" : "light"}>
                Book a Consultation
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile staggered menu */}
      <div className="md:hidden">
        <StaggeredMenu
          isFixed
          solid={solid}
          position="right"
          items={mobileItems}
          actions={mobileActions}
          colors={["#2540c4", "#0a196d"]}
          accentColor="#0a196d"
          logoUrl="/brand/litch-mark.svg"
        />
      </div>
    </header>
  );
}
