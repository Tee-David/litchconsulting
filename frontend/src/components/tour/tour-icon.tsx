"use client";

import { motion, useReducedMotion, type Transition, type TargetAndTransition } from "framer-motion";
import {
  Activity,
  BadgeCheck,
  BarChart3,
  Bell,
  Bot,
  Briefcase,
  Cable,
  Calculator,
  CheckCircle2,
  Clock,
  Compass,
  CreditCard,
  FileStack,
  FileText,
  Filter,
  Flag,
  Gauge,
  Handshake,
  LayoutGrid,
  LifeBuoy,
  Lightbulb,
  Inbox,
  MousePointerClick,
  PanelLeft,
  PenSquare,
  Pin,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The tour's icon vocabulary. Every step names one of these; the tooltip header
 * renders it inside a brand-tinted disc with a gentle, looping animation.
 *
 * Kept as a plain map (no JSX) so `registry.ts` can import the `TourIconName`
 * union as a type without pulling a client component into its module graph.
 */
export const TOUR_ICONS = {
  activity: Activity,
  badgeCheck: BadgeCheck,
  barChart: BarChart3,
  bell: Bell,
  bot: Bot,
  briefcase: Briefcase,
  cable: Cable,
  calculator: Calculator,
  check: CheckCircle2,
  clock: Clock,
  compass: Compass,
  creditCard: CreditCard,
  fileStack: FileStack,
  fileText: FileText,
  filter: Filter,
  flag: Flag,
  gauge: Gauge,
  handshake: Handshake,
  inbox: Inbox,
  layout: LayoutGrid,
  lifeBuoy: LifeBuoy,
  lightbulb: Lightbulb,
  pointer: MousePointerClick,
  panelLeft: PanelLeft,
  penSquare: PenSquare,
  pin: Pin,
  plus: Plus,
  receipt: Receipt,
  replay: RotateCcw,
  search: Search,
  send: Send,
  settings: Settings,
  shieldCheck: ShieldCheck,
  sparkles: Sparkles,
  trash: Trash2,
  users: Users,
  wallet: Wallet,
} satisfies Record<string, LucideIcon>;

export type TourIconName = keyof typeof TOUR_ICONS;

type MotionFamily = "float" | "pulse" | "wiggle" | "spin" | "bob" | "nudge";

/** Each family is a small, low-amplitude loop — presence, never distraction. */
const FAMILIES: Record<MotionFamily, { animate: TargetAndTransition; transition: Transition }> = {
  float: {
    animate: { y: [0, -2.5, 0] },
    transition: { duration: 2.6, repeat: Infinity, ease: "easeInOut" },
  },
  pulse: {
    animate: { scale: [1, 1.12, 1] },
    transition: { duration: 2, repeat: Infinity, ease: "easeInOut" },
  },
  wiggle: {
    animate: { rotate: [0, -9, 8, -4, 0] },
    transition: { duration: 1.6, repeat: Infinity, repeatDelay: 1.6, ease: "easeInOut" },
  },
  spin: {
    animate: { rotate: 360 },
    transition: { duration: 10, repeat: Infinity, ease: "linear" },
  },
  bob: {
    animate: { y: [0, -1.5, 0], scale: [1, 1.06, 1] },
    transition: { duration: 2.8, repeat: Infinity, ease: "easeInOut" },
  },
  nudge: {
    animate: { x: [0, 2.5, 0], y: [0, 2.5, 0] },
    transition: { duration: 1.4, repeat: Infinity, repeatDelay: 0.6, ease: "easeInOut" },
  },
};

/** Icon → motion family. Anything unmapped floats. */
const ICON_MOTION: Partial<Record<TourIconName, MotionFamily>> = {
  activity: "pulse",
  bell: "wiggle",
  bot: "bob",
  compass: "spin",
  check: "pulse",
  badgeCheck: "pulse",
  clock: "spin",
  flag: "wiggle",
  gauge: "pulse",
  lightbulb: "pulse",
  pointer: "nudge",
  panelLeft: "nudge",
  pin: "wiggle",
  plus: "pulse",
  replay: "spin",
  search: "nudge",
  send: "nudge",
  settings: "spin",
  sparkles: "pulse",
  trash: "wiggle",
};

/**
 * Animated step icon. Renders a lucide glyph in a brand disc with a soft halo
 * that breathes behind it. All motion is disabled under `prefers-reduced-motion`
 * (via framer's `useReducedMotion`), leaving a clean static icon.
 */
export function TourIcon({
  name = "sparkles",
  className,
}: {
  name?: TourIconName;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const Icon = TOUR_ICONS[name] ?? Sparkles;
  const family = FAMILIES[ICON_MOTION[name] ?? "float"];

  return (
    <span
      className={cn(
        "relative grid size-9 shrink-0 place-items-center rounded-full bg-brand-tint text-brand",
        className,
      )}
    >
      {!reduced && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full bg-brand/10"
          animate={{ scale: [1, 1.3, 1], opacity: [0.55, 0, 0.55] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <motion.span
        className="relative grid place-items-center"
        animate={reduced ? undefined : family.animate}
        transition={reduced ? undefined : family.transition}
      >
        <Icon className="size-[18px]" strokeWidth={2} aria-hidden />
      </motion.span>
    </span>
  );
}
