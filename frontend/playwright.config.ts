import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a running dev server (default http://localhost:3101)
 * and the real services in frontend/.env.local (database, R2, LitchAI).
 * Each spec creates throwaway users and rows and deletes them afterwards.
 * See e2e/README.md.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3101";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 10 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["html", { outputFolder: "e2e/.report", open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: "npx next dev -p 3101",
        url: `${BASE_URL}/login`,
        reuseExistingServer: true,
        timeout: 300_000,
      },
});
