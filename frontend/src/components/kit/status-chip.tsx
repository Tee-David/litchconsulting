import { cn } from "@/lib/utils";

/**
 * One chip for every state in the product, with a written label and a glyph
 * that says whose move it is:
 *   us    half-filled  — with Litch (admin/staff must act)
 *   wait  hollow       — waiting on the client
 *   done  solid        — finished / good
 *   late  solid + bar  — overdue / failed
 *   shut  slashed      — closed without completion
 *   draft dashed       — not yet sent / draft
 * Tooltips are phrased for the viewer (`audience`), so the same state reads
 * "Waiting on client" to the firm and "Your move" to the client.
 */

export type ChipTone = "good" | "warn" | "bad" | "info" | "neutral" | "violet" | "brand";
export type ChipMove = "us" | "wait" | "done" | "late" | "shut" | "draft";
export type StatusDomain =
  | "request"
  | "quote"
  | "invoice"
  | "payment"
  | "item"
  | "deliverable"
  | "ticket"
  | "user"
  | "invitation"
  | "document";

type Def = { label: string; tone: ChipTone; move: ChipMove; clientLabel?: string };

const REQUEST: Record<string, Def> = {
  quote_requested: { label: "Quote requested", tone: "warn", move: "us", clientLabel: "Preparing your quote" },
  quote_sent: { label: "Quote sent", tone: "info", move: "wait", clientLabel: "Quote ready" },
  pending_payment: { label: "Awaiting payment", tone: "warn", move: "wait", clientLabel: "Payment due" },
  awaiting_documents: { label: "Awaiting documents", tone: "warn", move: "wait", clientLabel: "Documents needed" },
  in_progress: { label: "In progress", tone: "info", move: "us" },
  in_review: { label: "Internal review", tone: "violet", move: "us", clientLabel: "In progress" },
  client_review: { label: "Client review", tone: "brand", move: "wait", clientLabel: "Ready for your review" },
  delivered: { label: "Delivered", tone: "good", move: "wait" },
  completed: { label: "Completed", tone: "good", move: "done" },
  cancelled: { label: "Cancelled", tone: "neutral", move: "shut" },
  declined: { label: "Declined", tone: "neutral", move: "shut" },
  refunded: { label: "Refunded", tone: "bad", move: "shut" },
};

const BILLING: Record<string, Def> = {
  draft: { label: "Draft", tone: "neutral", move: "draft" },
  sent: { label: "Sent", tone: "info", move: "wait", clientLabel: "Due" },
  viewed: { label: "Viewed", tone: "info", move: "wait", clientLabel: "Due" },
  partially_paid: { label: "Part paid", tone: "warn", move: "wait", clientLabel: "Balance due" },
  paid: { label: "Paid", tone: "good", move: "done" },
  overdue: { label: "Overdue", tone: "bad", move: "late" },
  void: { label: "Void", tone: "neutral", move: "shut" },
  accepted: { label: "Accepted", tone: "good", move: "done" },
  expired: { label: "Expired", tone: "neutral", move: "shut" },
  declined: { label: "Declined", tone: "neutral", move: "shut" },
};

const PAYMENT: Record<string, Def> = {
  initialized: { label: "Started", tone: "neutral", move: "wait" },
  pending: { label: "Pending", tone: "warn", move: "wait" },
  proof: { label: "Proof to confirm", tone: "warn", move: "us", clientLabel: "Checking your transfer" },
  success: { label: "Paid", tone: "good", move: "done" },
  confirmed: { label: "Confirmed", tone: "good", move: "done" },
  failed: { label: "Failed", tone: "bad", move: "late" },
  abandoned: { label: "Abandoned", tone: "neutral", move: "shut" },
  rejected: { label: "Rejected", tone: "bad", move: "shut" },
  refunded: { label: "Refunded", tone: "bad", move: "shut" },
};

const ITEM: Record<string, Def> = {
  open: { label: "Open", tone: "warn", move: "wait", clientLabel: "Needs your reply" },
  supplied: { label: "Supplied", tone: "info", move: "us", clientLabel: "Sent to Litch" },
  received: { label: "Received", tone: "good", move: "done" },
  cancelled: { label: "Cancelled", tone: "neutral", move: "shut" },
};

const DELIVERABLE: Record<string, Def> = {
  draft: { label: "Draft", tone: "violet", move: "draft", clientLabel: "Draft for review" },
  final: { label: "Final", tone: "good", move: "done" },
};

const TICKET: Record<string, Def> = {
  open: { label: "Open", tone: "warn", move: "us", clientLabel: "With Litch" },
  pending: { label: "Waiting on client", tone: "info", move: "wait", clientLabel: "Your reply needed" },
  waiting: { label: "Waiting on client", tone: "info", move: "wait", clientLabel: "Your reply needed" },
  resolved: { label: "Solved", tone: "good", move: "done" },
  solved: { label: "Solved", tone: "good", move: "done" },
  closed: { label: "Closed", tone: "neutral", move: "shut" },
};

const USER: Record<string, Def> = {
  active: { label: "Active", tone: "good", move: "done" },
  unverified: { label: "Email not verified", tone: "warn", move: "wait" },
  suspended: { label: "Suspended", tone: "bad", move: "shut" },
};

const INVITATION: Record<string, Def> = {
  pending: { label: "Invited", tone: "info", move: "wait" },
  redeemed: { label: "Accepted", tone: "good", move: "done" },
  expired: { label: "Invite expired", tone: "neutral", move: "shut" },
  revoked: { label: "Revoked", tone: "neutral", move: "shut" },
};

const DOCUMENT: Record<string, Def> = {
  unscanned: { label: "Scanning", tone: "neutral", move: "us" },
  clean: { label: "Scanned", tone: "good", move: "done" },
  infected: { label: "Blocked", tone: "bad", move: "late" },
};

const MAPS: Record<StatusDomain, Record<string, Def>> = {
  request: REQUEST,
  quote: BILLING,
  invoice: BILLING,
  payment: PAYMENT,
  item: ITEM,
  deliverable: DELIVERABLE,
  ticket: TICKET,
  user: USER,
  invitation: INVITATION,
  document: DOCUMENT,
};

const TONE: Record<ChipTone, string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  neutral: "bg-neutral-soft text-neutral",
  violet: "bg-violet-soft text-violet",
  brand: "bg-brand-tint text-brand",
};

const MOVE_TEXT: Record<"firm" | "client", Record<ChipMove, string>> = {
  firm: { us: "Our move", wait: "Waiting on client", done: "Done", late: "Late", shut: "Closed", draft: "Not sent" },
  client: { us: "With Litch", wait: "Your move", done: "Done", late: "Overdue", shut: "Closed", draft: "Not sent yet" },
};

/** Look up a state; unknown values render readable instead of raw snake_case. */
export function statusDef(domain: StatusDomain, status: string | null | undefined): Def {
  const key = (status ?? "").toLowerCase();
  const def = MAPS[domain][key];
  if (def) return def;
  const label = key ? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "Unknown";
  return { label, tone: "neutral", move: "us" };
}

export function statusLabel(domain: StatusDomain, status: string | null | undefined, audience: "firm" | "client" = "firm") {
  const d = statusDef(domain, status);
  return audience === "client" ? d.clientLabel ?? d.label : d.label;
}

function Glyph({ move }: { move: ChipMove }) {
  // 10px circle drawn in currentColor so it inherits the tone.
  const common = { width: 10, height: 10, viewBox: "0 0 10 10", "aria-hidden": true } as const;
  switch (move) {
    case "done":
      return <svg {...common}><circle cx="5" cy="5" r="4" fill="currentColor" /></svg>;
    case "us":
      return (
        <svg {...common}>
          <circle cx="5" cy="5" r="3.9" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M5 1.1a3.9 3.9 0 0 1 0 7.8z" fill="currentColor" />
        </svg>
      );
    case "wait":
      return <svg {...common}><circle cx="5" cy="5" r="3.9" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>;
    case "late":
      return (
        <svg {...common}>
          <circle cx="5" cy="5" r="4" fill="currentColor" />
          <rect x="4.35" y="2.2" width="1.3" height="3.6" rx=".6" fill="var(--color-paper)" />
          <circle cx="5" cy="7.4" r=".75" fill="var(--color-paper)" />
        </svg>
      );
    case "shut":
      return (
        <svg {...common}>
          <circle cx="5" cy="5" r="3.9" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M2.4 7.6 7.6 2.4" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case "draft":
      return <svg {...common}><circle cx="5" cy="5" r="3.9" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.6" /></svg>;
  }
}

export function StatusChip({
  domain,
  status,
  audience = "firm",
  size = "md",
  className,
  suffix,
}: {
  domain: StatusDomain;
  status: string | null | undefined;
  audience?: "firm" | "client";
  size?: "sm" | "md";
  className?: string;
  /** Extra short text after the label, e.g. "50%" or "Round 2". */
  suffix?: string;
}) {
  const def = statusDef(domain, status);
  const label = audience === "client" ? def.clientLabel ?? def.label : def.label;
  const move = MOVE_TEXT[audience][def.move];
  return (
    <span
      title={`${label} · ${move}`}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        TONE[def.tone],
        className,
      )}
    >
      <Glyph move={def.move} />
      <span className="truncate">{label}</span>
      {suffix ? <span className="opacity-75">· {suffix}</span> : null}
      <span className="sr-only">({move})</span>
    </span>
  );
}
