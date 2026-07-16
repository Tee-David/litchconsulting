"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing, Loader2 } from "lucide-react";
import { useToast } from "@/components/admin/ui/toaster";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Enable/disable browser push for admin alerts on this device. Uses the
 * existing PWA service worker; the endpoint is stored per-browser via
 * /api/push/subscribe.
 */
export function PushToggle() {
  const toast = useToast();
  const [state, setState] = useState<"loading" | "unsupported" | "off" | "on">("loading");

  useEffect(() => {
    void (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unsupported");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setState(sub ? "on" : "off");
      } catch {
        setState("off");
      }
    })();
  }, []);

  async function enable() {
    setState("loading");
    try {
      const keyRes = (await fetch("/api/push/subscribe").then((r) => r.json())) as {
        ok: boolean;
        publicKey?: string;
        error?: string;
      };
      if (!keyRes.ok || !keyRes.publicKey) throw new Error(keyRes.error || "Push not configured");

      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notifications were blocked by the browser.");

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey),
      });
      const json = sub.toJSON();
      const res = (await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
      }).then((r) => r.json())) as { ok: boolean; error?: string };
      if (!res.ok) throw new Error(res.error || "Could not save subscription");

      setState("on");
      toast.success("Push alerts enabled on this device");
    } catch (err) {
      setState("off");
      toast.error(err instanceof Error ? err.message : "Could not enable push");
    }
  }

  async function disable() {
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
      toast.success("Push alerts disabled");
    } catch {
      setState("on");
      toast.error("Could not disable push");
    }
  }

  if (state === "unsupported") return null;

  return (
    <button
      type="button"
      onClick={state === "on" ? disable : state === "off" ? enable : undefined}
      disabled={state === "loading"}
      className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3.5 py-2 text-xs font-semibold text-body transition-colors hover:bg-surface disabled:opacity-60"
      title="Browser push alerts for new requests, payments and uploads"
    >
      {state === "loading" ? (
        <Loader2 className="size-4 animate-spin" />
      ) : state === "on" ? (
        <BellRing className="size-4 text-emerald-500" />
      ) : (
        <BellOff className="size-4" />
      )}
      {state === "on" ? "Push on" : state === "off" ? "Enable push" : "Push"}
    </button>
  );
}
