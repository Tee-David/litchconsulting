"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields, twoFactorClient } from "better-auth/client/plugins";
import type { auth } from "./auth";

/**
 * Browser auth client. Same-origin, so baseURL is inferred from the page.
 * Usage:
 *   authClient.signUp.email({ email, password, name })   // role defaults to "client"
 *   authClient.signIn.email({ email, password })
 *   authClient.signIn.social({ provider: "google" })
 *   authClient.signOut()
 *   const { data: session } = authClient.useSession()
 */
export const authClient = createAuthClient({
  // twoFactorClient: password sign-ins of two-step users return
  // { twoFactorRedirect } and the login form asks for the code in place.
  plugins: [inferAdditionalFields<typeof auth>(), twoFactorClient()],
});

export const { signIn, signUp, useSession, twoFactor } = authClient;

/**
 * Sign out, then delete this device's saved copies of pages and sheet data
 * (the service worker keeps them so an open workbench reads offline, R6).
 */
export const signOut: typeof authClient.signOut = async (...args) => {
  const res = await authClient.signOut(...args);
  try {
    if (typeof caches !== "undefined") for (const k of await caches.keys()) if (k.startsWith("litch-")) await caches.delete(k);
  } catch {
    /* no cache storage in this browser */
  }
  return res;
};
