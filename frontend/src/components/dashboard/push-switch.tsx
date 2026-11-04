"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/kit";
import { useToast } from "@/components/admin/ui/toaster";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Turn browser push on/off for THIS device, for any signed-in user. */
export function PushSwitch() {
  const toast = useToast();
  const [state, setState] = useState<"loading" | "unsupported" | "blocked" | "off" | "on">("loading");

  useEffect(() => {
    void (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      try {
        const reg = await navigator.serviceWorker.ready;
        setState((await reg.pushManager.getSubscription()) ? "on" : "off");
      } catch {
        setState("off");
      }
    })();
  }, []);

  const enable = async () => {
    setState("loading");
    try {
      const key = (await fetch("/api/push/subscribe").then((r) => r.json())) as { ok: boolean; publicKey?: string; error?: string };
      if (!key.ok || !key.publicKey) throw new Error(key.error || "Push is not set up on our side yet.");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "blocked" : "off");
        toast.error("Your browser blocked notifications. Allow them in the site settings, then try again.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key.publicKey) });
      const res = (await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.toJSON().keys }),
      }).then((r) => r.json())) as { ok: boolean; error?: string };
      if (!res.ok) throw new Error(res.error || "Could not save this device.");
      setState("on");
      toast.success("Push is on for this device");
    } catch (e) {
      setState("off");
      toast.error(e instanceof Error ? e.message : "Could not turn on push.");
    }
  };

  const disable = async () => {
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
      toast.success("Push is off for this device");
    } catch {
      setState("on");
      toast.error("Could not turn off push. Try again.");
    }
  };

  if (state === "unsupported") return <p className="text-sm text-muted">This browser does not support push notifications. Email and the bell still work.</p>;
  if (state === "blocked") return <p className="text-sm text-warn">Notifications are blocked for this site in your browser settings. Allow them there to turn push on.</p>;
  return state === "on" ? (
    <Button onClick={disable}>
      <BellOff className="size-4" aria-hidden /> Turn off push on this device
    </Button>
  ) : (
    <Button variant="primary" onClick={enable} disabled={state === "loading"}>
      {state === "loading" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <BellRing className="size-4" aria-hidden />}
      Turn on push on this device
    </Button>
  );
}
