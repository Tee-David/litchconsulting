"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Building2, DatabaseBackup, Lock, Percent, PlugZap, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";

/** The settings sections, in the order of the approved design (plus Privacy). */
const SECTIONS = [
  { href: "/admin/settings", label: "Firm details", icon: Building2 },
  { href: "/admin/settings/access", label: "Team and access", icon: Users, also: ["/admin/settings/users"] },
  { href: "/admin/notifications#prefs", label: "Notifications", icon: Bell, match: "/admin/notifications" },
  { href: "/admin/settings/billing", label: "Billing and tax", icon: Percent },
  { href: "/admin/settings/backups", label: "Backups", icon: DatabaseBackup },
  { href: "/admin/settings/integrations", label: "Integrations", icon: PlugZap },
  { href: "/admin/settings/privacy", label: "Privacy", icon: Lock },
  { href: "/account/security", label: "Security", icon: ShieldCheck },
];

function isActive(pathname: string, s: (typeof SECTIONS)[number]) {
  const base = s.match ?? s.href;
  if (base === "/admin/settings") return pathname === base;
  return pathname === base || pathname.startsWith(base + "/") || (s.also ?? []).some((a) => pathname.startsWith(a));
}

/**
 * Settings section menu: a card list on the left from tablet width up, a
 * scrolling row of pills on phones.
 */
export function SettingsNav() {
  const pathname = usePathname() ?? "/admin/settings";
  return (
    <nav aria-label="Settings sections" className="min-w-0">
      <ul className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-col md:gap-0.5 md:overflow-visible md:rounded-card md:border md:border-hairline md:bg-paper md:p-2">
        {SECTIONS.map((s) => {
          const on = isActive(pathname, s);
          return (
            <li key={s.href} className="shrink-0">
              <Link
                href={s.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex min-h-[40px] items-center gap-2.5 whitespace-nowrap rounded-ctl px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40",
                  "max-md:rounded-full max-md:border max-md:border-hairline",
                  on ? "bg-brand-tint font-semibold text-ink max-md:border-transparent" : "text-body hover:bg-surface hover:text-ink",
                )}
              >
                <s.icon className="size-4 shrink-0" aria-hidden /> {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
