"use client";

import { motion, useReducedMotion } from "framer-motion";
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

/**
 * Step icon on a solid brand tile. It scales in once when the stop opens; it
 * never loops. No motion with reduced motion.
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
  return (
    <motion.span
      key={name}
      initial={reduced ? false : { scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={cn("keep-brand grid size-9 shrink-0 place-items-center rounded-xl bg-brand text-white dark:bg-info dark:text-paper", className)}
    >
      <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
    </motion.span>
  );
}
