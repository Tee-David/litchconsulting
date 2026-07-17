import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit tests for the pure server-side logic money correctness depends on
 * (invoice math, Paystack kobo conversion, webhook signature). DB-bound server
 * actions are deliberately out of scope — they're covered by the live app.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // Next-only build guard; no runtime behaviour to reproduce here.
      "server-only": fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
