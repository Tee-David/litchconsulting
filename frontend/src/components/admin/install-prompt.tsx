"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * PWA install prompt. Only rendered inside the dashboard/admin (so it never
 * appears on the public marketing pages), and only when the browser fires
 * `beforeinstallprompt` and the app isn't already installed.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem("litch:pwa-dismissed") === "1";
    } catch {}
    if (dismissed || window.matchMedia("(display-mode: standalone)").matches) return;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    const onInstalled = () => setShow(false);
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setShow(false);
    setDeferred(null);
  }
  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem("litch:pwa-dismissed", "1");
    } catch {}
  }

  if (!show) return null;
  return (
    <div className="fixed bottom-4 left-4 z-[80] w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-hairline bg-paper p-4 shadow-xl shadow-black/15">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand">
          <Download className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Install Litch</p>
          <p className="mt-0.5 text-xs text-body">Add the app to your device for faster, offline access.</p>
          <div className="mt-3 flex gap-2">
            <button onClick={install} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-hover">
              Install
            </button>
            <button onClick={dismiss} className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-medium text-body transition-colors hover:bg-surface">
              Not now
            </button>
          </div>
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="text-muted transition-colors hover:text-ink">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
