"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

/**
 * Cloudflare Turnstile widget (explicit render, "interaction-only": most real
 * visitors never see it; it appears only when Cloudflare wants a click).
 * Renders nothing when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset, and the
 * server skips verification in that case too.
 *
 *   const ts = useRef<TurnstileHandle>(null);
 *   <Turnstile ref={ts} onToken={setToken} />
 *   ...on submit: const token = await ts.current?.ensureToken()
 *   ...after a refused submit: ts.current?.reset()
 *
 * Reliability (19 Nov: a press on "Sign in" before the token arrived left the
 * widget stuck until a reload): the widget re-runs itself after an expiry or an
 * error, a submit waits for the token instead of failing, and a reset gets a
 * fresh token at once.
 */

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
  getResponse: (id?: string) => string | undefined;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null; // the next attempt loads it again
        s.remove();
        reject(new Error("Turnstile failed to load"));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

export const turnstileConfigured = Boolean(SITE_KEY);

/** Headers that carry the widget token to the auth route (sign-in, sign-up). */
export function turnstileHeaders(token: string | null): Record<string, string> {
  return token ? { "x-turnstile-token": token } : {};
}

export type TurnstileHandle = {
  /** Clear the token and run the check again (after a refused submit). */
  reset: () => void;
  /** The token, waiting for the check to finish when needed (null after the wait). */
  ensureToken: (waitMs?: number) => Promise<string | null>;
};

type Status = "loading" | "ready" | "verified" | "needs-click" | "failed";

export const Turnstile = forwardRef<
  TurnstileHandle,
  { onToken: (token: string | null) => void; action?: string; className?: string }
>(function Turnstile({ onToken, action, className }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const token = useRef<string | null>(null);
  const waiters = useRef<((t: string | null) => void)[]>([]);
  const cb = useRef(onToken);
  cb.current = onToken;
  const [status, setStatus] = useState<Status>("loading");

  const setTok = (t: string | null) => {
    token.current = t;
    cb.current(t);
    if (t) {
      setStatus("verified");
      for (const w of waiters.current.splice(0)) w(t);
    }
  };

  const rerun = () => {
    setTok(null);
    if (widgetId.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetId.current);
      } catch {
        /* the widget was removed: the effect renders it again */
      }
    }
  };

  useImperativeHandle(ref, () => ({
    reset: rerun,
    ensureToken: (waitMs = 15_000) => {
      if (!SITE_KEY) return Promise.resolve(null);
      const live = token.current || (widgetId.current && window.turnstile?.getResponse(widgetId.current)) || null;
      if (live) return Promise.resolve(live);
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          waiters.current = waiters.current.filter((w) => w !== done);
          resolve(null);
        }, waitMs);
        const done = (t: string | null) => {
          clearTimeout(timer);
          resolve(t);
        };
        waiters.current.push(done);
      });
    },
  }));

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;
    let tries = 0;
    const mount = () =>
      loadScript()
        .then(() => {
          if (cancelled || !box.current || !window.turnstile || widgetId.current) return;
          widgetId.current = window.turnstile.render(box.current, {
            sitekey: SITE_KEY,
            action,
            appearance: "interaction-only",
            theme: "auto",
            retry: "auto",
            "retry-interval": 2000,
            "refresh-expired": "auto",
            callback: (t: string) => setTok(t),
            "expired-callback": () => rerun(),
            "error-callback": () => {
              setStatus("failed");
              setTok(null);
              setTimeout(rerun, 1500); // try again by itself
              return true; // handled: no console noise
            },
            "before-interactive-callback": () => setStatus("needs-click"),
          });
          setStatus("ready");
        })
        .catch(() => {
          setStatus("failed");
          if (++tries < 3 && !cancelled) setTimeout(mount, 2000 * tries); // the script failed to load
        });
    mount();
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  if (!SITE_KEY) return null;
  return (
    <div className={className}>
      <div ref={box} />
      <p className="mt-1 flex min-h-5 items-center gap-1.5 text-[12px] text-muted" aria-live="polite">
        {status === "verified" ? (
          <><ShieldCheck className="size-3.5 text-good" aria-hidden /> Security check done</>
        ) : status === "needs-click" ? (
          "Tick the box above to finish the security check."
        ) : status === "failed" ? (
          <><Loader2 className="size-3.5 animate-spin" aria-hidden /> Security check is retrying…</>
        ) : (
          <><Loader2 className="size-3.5 animate-spin" aria-hidden /> Checking you are human…</>
        )}
      </p>
    </div>
  );
});
