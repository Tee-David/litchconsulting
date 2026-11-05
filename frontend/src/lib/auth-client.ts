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

export const { signIn, signUp, signOut, useSession, twoFactor } = authClient;
