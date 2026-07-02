"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
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
  plugins: [inferAdditionalFields<typeof auth>()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
