"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Clock } from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";
import { fireConfetti } from "@/components/tour/confetti";
import type { AttentionAction, AttentionActionResult, AttentionItem } from "./attention-list";
import "./attention-deck.css";

/* ──────────────────────────────────────────────────────────────────────────
 * "What needs you" as a deck: one card at a time, the worst first, the others
 * stacked behind it. Same items and server actions as AttentionList. Each card
 * has one primary action, one secondary, Snooze and Open details. A done card
 * gets a stamp from the pressed button and leaves; the next card rises.
 * Keyboard: focus the card, then D for done, S for snooze until tomorrow.
 * Snoozes are kept on this device and expire by themselves.
 * ────────────────────────────────────────────────────────────────────────── */

const KEY = "litch.attention.deck";
const EVENT = "litch:attention-deck";

const SEV = {
  3: { label: "Needs you now", cls: "is-bad" },
  2: { label: "Waiting", cls: "is-warn" },
  1: { label: "Open", cls: "is-info" },
} as const;

const SNOOZE: { label: string; hours: number; hint: string }[] = [
  { label: "In 1 hour", hours: 1, hint: "An hour from now" },
  { label: "This afternoon", hours: 4, hint: "Four hours from now" },
  { label: "Tomorrow", hours: 20, hint: "Tomorrow morning" },
  { label: "Next week", hours: 24 * 5, hint: "In five days" },
];

type Leaving = { id: string; how: "done" | "snooze"; x: number; y: number };
type Act = { label: string; href?: string; actionId?: string };

function readSaved(): Record<string, number> {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

export function AttentionDeck({
  items,
  actions = {},
  undo,
  title = "What needs you",
  emptyTitle = "You're all caught up",
  emptyWhy = "Nothing is waiting on you right now. New items appear here the moment they need a decision.",
  emptyAction,
}: {
  items: AttentionItem[];
  actions?: Record<string, AttentionAction>;
  undo?: (undoId: string) => Promise<AttentionActionResult>;
  title?: string;
  emptyTitle?: string;
  emptyWhy?: string;
  emptyAction?: ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [cleared, setCleared] = useState<Record<string, true>>({});
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [menu, setMenu] = useState(false);
  const [menuAt, setMenuAt] = useState<"above" | "side" | "below">("above");
  const [startN] = useState(items.length);
  const cardRef = useRef<HTMLElement>(null);
  const snoozeRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const celebrated = useRef(false);

  // Snoozed ids that are still asleep. Changes only when one falls asleep or wakes.
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener("storage", notify);
    window.addEventListener(EVENT, notify);
    return () => {
      window.removeEventListener("storage", notify);
      window.removeEventListener(EVENT, notify);
    };
  }, []);
  const read = useCallback(() => {
    const saved = readSaved();
    const now = Date.now();
    return JSON.stringify(Object.keys(saved).filter((k) => saved[k] > now).sort());
  }, []);
  const asleepRaw = useSyncExternalStore(subscribe, read, () => "[]");
  const asleep = useMemo(() => new Set<string>(JSON.parse(asleepRaw) as string[]), [asleepRaw]);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((t) => window.clearTimeout(t));
  }, []);

  // The snooze menu closes on a press outside it and on Escape.
  useEffect(() => {
    if (!menu) return;
    const out = (e: PointerEvent) => {
      if (!snoozeRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(false);
        snoozeRef.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", out);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", out);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const queue = useMemo(
    () => items.filter((i) => !cleared[i.id] && !asleep.has(i.id)).sort((a, b) => b.severity - a.severity),
    [items, cleared, asleep],
  );
  const top = queue[0];
  const handled = Math.max(0, startN - queue.length);

  // The last card leaving is the moment the deck is cleared.
  useEffect(() => {
    if (!top && startN > 0 && handled > 0 && !celebrated.current) {
      celebrated.current = true;
      fireConfetti();
    }
  }, [top, handled, startN]);

  const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, calm() ? 0 : ms));
  };

  const stamp = (e: MouseEvent | null, id: string, how: "done" | "snooze") => {
    const card = cardRef.current?.getBoundingClientRect();
    const b = e?.currentTarget instanceof HTMLElement ? e.currentTarget.getBoundingClientRect() : null;
    const x = card && b ? ((b.left + b.width / 2 - card.left) / card.width) * 100 : 50;
    const y = card && b ? ((b.top + b.height / 2 - card.top) / card.height) * 100 : 80;
    setLeaving({ id, how, x, y });
  };

  const bringBack = (id: string) =>
    setCleared((c) => {
      const n = { ...c };
      delete n[id];
      return n;
    });

  const run = async (e: MouseEvent | null, item: AttentionItem, actionId: string) => {
    const fn = actions[actionId];
    if (!fn || busy || leaving) return;
    setBusy(true);
    setNote("");
    try {
      const res = await fn(item.id);
      if (!res.ok) {
        setNote(res.error);
        return;
      }
      stamp(e, item.id, "done");
      later(() => {
        setLeaving(null);
        setCleared((c) => ({ ...c, [item.id]: true }));
        router.refresh();
      }, 780);
      if (res.undoId && undo) {
        const undoId = res.undoId;
        toast.action(res.message ?? "Done", {
          label: "Undo",
          onAction: async () => {
            const u = await undo(undoId);
            if (u.ok) {
              celebrated.current = false;
              bringBack(item.id);
              router.refresh();
            } else toast.error(u.error);
          },
        });
      } else toast.success(res.message ?? "Done");
    } catch {
      setNote("That did not go through. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  const snooze = (e: MouseEvent | null, item: AttentionItem, hours: number, label: string) => {
    if (leaving) return;
    setMenu(false);
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ ...readSaved(), [item.id]: Date.now() + hours * 3_600_000 }));
    } catch {
      /* a blocked store only means the snooze does not survive a reload */
      setCleared((c) => ({ ...c, [item.id]: true }));
    }
    stamp(e, item.id, "snooze");
    later(() => {
      setLeaving(null);
      window.dispatchEvent(new Event(EVENT));
    }, 520);
    toast.action(`Snoozed. It comes back ${label.toLowerCase()}.`, {
      label: "Undo",
      onAction: () => {
        const rest = readSaved();
        delete rest[item.id];
        try {
          window.localStorage.setItem(KEY, JSON.stringify(rest));
        } catch {
          /* ignore */
        }
        bringBack(item.id);
        window.dispatchEvent(new Event(EVENT));
      },
    });
  };

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (!top || e.target !== e.currentTarget || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.toLowerCase() === "d" && top.primary.actionId) {
      e.preventDefault();
      void run(null, top, top.primary.actionId);
    }
    if (e.key.toLowerCase() === "s") {
      e.preventDefault();
      snooze(null, top, 20, "tomorrow");
    }
  };

  const segs = Math.min(8, Math.max(startN, 1));
  const doneSegs = Math.min(segs, Math.round((handled / Math.max(startN, 1)) * segs));

  // Secondary = the first extra action; Open details = a place to look that no button already opens.
  const secondary: Act | undefined = top?.more?.[0];
  const openHref = top ? [top.primary, ...(top.more ?? [])].find((a) => a.href && a.href !== top.primary.href && a.href !== secondary?.href)?.href : undefined;

  const actBtn = (a: Act, primary: boolean) => {
    const cls = `ldeck__btn${primary ? " ldeck__btn--act" : ""}`;
    if (a.href)
      return (
        <Link className={cls} href={a.href}>
          {a.label}
          {primary ? <ArrowRight aria-hidden /> : null}
        </Link>
      );
    return (
      <button type="button" className={cls} disabled={busy || !!leaving} onClick={(e) => top && a.actionId && run(e, top, a.actionId)}>
        {primary ? <Check aria-hidden /> : null}
        {busy && primary ? "Working…" : a.label}
      </button>
    );
  };

  return (
    <section className="ldeck" aria-label={title}>
      <div className="ldeck__head">
        <h2 className="font-display">{title}</h2>
        {startN > 0 ? (
          <>
            <span className="ldeck__strip" role="img" aria-label={`${handled} of ${startN} handled`}>
              {Array.from({ length: segs }, (_, i) => (
                <span key={i} className={i < doneSegs ? "on" : ""} />
              ))}
            </span>
            <span className="ldeck__count tabular-nums">
              {queue.length ? `${queue.length} ${queue.length === 1 ? "thing needs" : "things need"} you` : "All handled"}
            </span>
          </>
        ) : null}
        <span className="ldeck__keys">Focus the card: D done, S snooze</span>
      </div>

      {top ? (
        <div className="ldeck__stack">
          {queue.length > 1 ? <span className="ldeck__ghost" aria-hidden /> : null}
          {queue.length > 2 ? <span className="ldeck__ghost ldeck__ghost--2" aria-hidden /> : null}
          <article
            key={top.id}
            ref={cardRef}
            className={`ldeck__card${leaving ? ` is-${leaving.how}` : ""}`}
            tabIndex={0}
            onKeyDown={onKey}
            aria-label={`${top.group}: ${top.title}`}
          >
            <div className="ldeck__tags">
              <span className="ldeck__tag ldeck__tag--kind">{top.group}</span>
              <span className={`ldeck__tag ${SEV[top.severity].cls}`}>{SEV[top.severity].label}</span>
              {top.when ? <span className="ldeck__label tabular-nums">{top.when}</span> : null}
            </div>
            <div className="ldeck__text">
              <h3 className="font-display">{top.title}</h3>
              {top.detail ? <p>{top.detail}</p> : null}
            </div>
            {top.amount && !top.detail?.includes(top.amount) ? (
              <dl className="ldeck__facts">
                <div>
                  <dt>Amount</dt>
                  <dd className="tabular-nums">{top.amount}</dd>
                </div>
              </dl>
            ) : null}
            <div className="ldeck__acts">
              {actBtn(top.primary, true)}
              {secondary ? actBtn(secondary, false) : null}
              <span className="ldeck__sp" />
              <div className="ldeck__tools">
                <div className="ldeck__snooze" ref={snoozeRef}>
                  <button
                    type="button"
                    className="ldeck__btn"
                    aria-haspopup="menu"
                    aria-expanded={menu}
                    onClick={() => {
                      const b = snoozeRef.current?.getBoundingClientRect();
                      const c = cardRef.current?.getBoundingClientRect();
                      // Above when there is room; else beside the button (wide cards); else under the tools.
                      const h = SNOOZE.length * 44 + 16;
                      setMenuAt(!b || !c || b.top - c.top >= h ? "above" : b.left - c.left >= 240 && b.bottom - c.top >= h - 12 ? "side" : "below");
                      setMenu((m) => !m);
                    }}
                  >
                    <Clock aria-hidden />
                    Snooze
                  </button>
                  {menu ? (
                    <div className={`ldeck__menu${menuAt === "above" ? "" : ` is-${menuAt}`}`} role="menu" aria-label="Bring it back">
                      {SNOOZE.map((s) => (
                        <button key={s.label} type="button" role="menuitem" onClick={(e) => snooze(e, top, s.hours, s.label)}>
                          <span>{s.label}</span>
                          <small>{s.hint}</small>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                {openHref ? (
                  <Link className="ldeck__btn ldeck__btn--quiet" href={openHref}>
                    Open details
                  </Link>
                ) : null}
              </div>
            </div>
            {note ? (
              <p className="ldeck__note" role="status">
                {note}
              </p>
            ) : null}
            {leaving ? (
              <span
                className="ldeck__stamp"
                style={{ "--cx": `${leaving.x}%`, "--cy": `${leaving.y}%`, "--st": leaving.how === "done" ? "var(--ldeck-good)" : "var(--ldeck-neutral)" } as CSSProperties}
                aria-hidden
              >
                <span className="ldeck__ring" />
                <span className="ldeck__stampIn">
                  {leaving.how === "done" ? (
                    <svg viewBox="0 0 24 24" width="46" height="46">
                      <path d="M5 12.5l4.5 4.5L19 7" pathLength="1" />
                    </svg>
                  ) : (
                    <Clock width={44} height={44} />
                  )}
                  <b className="font-display">{leaving.how === "done" ? "Done" : "Snoozed"}</b>
                </span>
              </span>
            ) : null}
          </article>
        </div>
      ) : (
        <div className="ldeck__empty">
          <span className="ldeck__emptyIc">
            <Check aria-hidden />
          </span>
          <h3 className="font-display">{emptyTitle}</h3>
          <p>{emptyWhy}</p>
          {emptyAction}
          {asleep.size || Object.keys(cleared).length ? (
            <button
              type="button"
              className="ldeck__btn ldeck__btn--quiet"
              onClick={() => {
                setCleared({});
                celebrated.current = false;
                try {
                  window.localStorage.removeItem(KEY);
                } catch {
                  /* see above */
                }
                window.dispatchEvent(new Event(EVENT));
              }}
            >
              Bring everything back
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
