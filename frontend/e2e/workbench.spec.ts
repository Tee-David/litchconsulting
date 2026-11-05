/**
 * The co-pilot workbench, end to end against the real analysis server:
 * a request with a ledger xlsx → open in the workbench (blind relay to the
 * VM) → ask Sage → accept the proposal → undo it → download the recomputed
 * XLSX. Screenshots at 1440 and 390 px go to e2e/.results/screens/.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { addRequestFile, cleanup, closeDb, createClient, createRequest, enrolTwoStep, signUp, type TestUser } from "./support/data";

const SHOTS = join(__dirname, ".results", "screens");
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

test.skip(!process.env.LITCHAI_API_URL && !readFileSync(join(__dirname, "..", ".env.local"), "utf8").includes("LITCHAI_API_URL="), "LITCHAI_API_URL is not set");

test.describe("workbench", () => {
  let admin: TestUser;
  let requestId: string;

  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    admin = await signUp(api, { tag: "wb-admin", role: "admin", name: "E2E Admin" });
    await api.dispose();
    const clientId = await createClient({ name: `E2E Agro ${Date.now().toString().slice(-5)}` });
    const req = await createRequest({ clientId, userId: admin.id });
    requestId = req.id;
    await addRequestFile(requestId, "ledger-bank.xlsx", readFileSync(join(__dirname, "fixtures", "ledger-bank.xlsx")), XLSX);
  });

  test.afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  test("open, ask, accept, undo, download", async ({ page }) => {
    await enrolTwoStep(page.request, admin);

    // Start: the request's spreadsheet is pre-selected.
    await page.goto(`/admin/analyses/w/new?requestId=${requestId}`);
    await expect(page.getByRole("heading", { name: "Open in the workbench" })).toBeVisible();
    await expect(page.getByRole("checkbox").first()).toBeChecked();
    await page.getByRole("button", { name: "Open workbench" }).click();
    await page.waitForURL(/\/admin\/analyses\/w\/wb-/, { timeout: 180_000 });

    // First look (no model) + the grid with every sheet as a tab.
    await expect(page.getByRole("region", { name: "First look" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("tab", { name: "Ledger" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Bank" })).toBeVisible();
    await expect(page.getByRole("grid", { name: "Sheet Ledger" })).toContainText("Sales invoice INV001");
    await page.screenshot({ path: join(SHOTS, "workbench-1440-first-look.png") });

    // Ask: a write turn → a proposal (pipeline-computed, nothing written yet).
    const box = page.getByLabel("Message to Sage");
    await box.fill("Categorise the ledger transactions.");
    await box.press("Enter");
    const proposals = page.getByRole("region", { name: "Proposed changes" });
    await expect(proposals.getByRole("button", { name: /^Accept$/ }).first()).toBeVisible({ timeout: 300_000 });
    await expect(page.getByText(/Categorise \d+ rows on Ledger/).first()).toBeVisible();
    await page.screenshot({ path: join(SHOTS, "workbench-1440-proposal.png") });

    // Accept → new version (recompute gate) → Undo.
    await proposals.getByRole("button", { name: /^Accept$/ }).first().click();
    await expect(proposals.getByText("Accepted").first()).toBeVisible({ timeout: 180_000 });
    await expect(page.getByRole("grid", { name: "Sheet Ledger" })).toContainText("Category", { timeout: 60_000 });
    await proposals.getByRole("button", { name: /Undo/ }).first().click();
    await expect(proposals.getByText("Undone").first()).toBeVisible({ timeout: 180_000 });

    // Download the gated XLSX.
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 180_000 }),
      page.getByRole("button", { name: /Download XLSX/ }).click(),
    ]);
    const file = await download.path();
    expect(file).toBeTruthy();
    expect(readFileSync(file!).subarray(0, 2).toString()).toBe("PK"); // a real xlsx (zip)
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);

    // Phone: Sheet / Sage switch and Sage as a bottom sheet.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole("radiogroup", { name: "Show" })).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: join(SHOTS, "workbench-390-sheet.png") });
    await page.getByRole("button", { name: /^Sage/ }).last().click();
    await expect(page.getByRole("dialog", { name: "Sage" })).toBeVisible();
    await page.screenshot({ path: join(SHOTS, "workbench-390-sage.png") });
  });
});
