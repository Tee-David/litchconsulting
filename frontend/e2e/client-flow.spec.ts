/**
 * The client journey, end to end, as two people in two browsers:
 *   client signs up → requests a quote-priced service
 *   admin prices it (the request's "Create quote invoice") and sends it
 *   client pays: Paystack test-mode checkout is opened and checked, then the
 *     money is settled by bank transfer with a proof (the Paystack callback
 *     needs a real card payment, so that last hop is stubbed by the transfer)
 *   admin confirms the transfer → client uploads the ledger
 *   admin opens it in the workbench and sends it as the final deliverable
 *   client sees the deliverable.
 * All rows, files and users are removed afterwards (support/data.ts).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { BASE_URL } from "./support/env";
import { cleanup, closeDb, db, enrolTwoStep, signUp, throwawayEmail, trackClient, trackRequest, type TestUser } from "./support/data";

const LEDGER = join(__dirname, "fixtures", "ledger-bank.xlsx");
const PROOF = join(__dirname, "fixtures", "transfer-proof.png");

async function clientSignIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /^Sign in/ }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

test.describe("client flow", () => {
  let admin: TestUser;

  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    admin = await signUp(api, { tag: "flow-admin", role: "admin", name: "E2E Admin" });
    await api.dispose();
  });

  test.afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  test("signup → request → quote → pay → upload → deliver", async ({ browser }) => {
    const clientCtx = await browser.newContext({ baseURL: BASE_URL });
    const adminCtx = await browser.newContext({ baseURL: BASE_URL });
    const client = await clientCtx.newPage();
    const adminPage = await adminCtx.newPage();

    // 1. Client signs up through the real form (Turnstile is off locally).
    const email = throwawayEmail("flow-client");
    const password = `E2e!Flow-${Date.now()}-x9`;
    await client.goto("/signup");
    await client.getByLabel("Your name").fill("Ada Flowtest");
    await client.getByLabel("Company").fill("Flowtest Farms Ltd");
    await client.getByLabel("Work email").fill(email);
    await client.getByLabel("Password").fill(password);
    await client.getByRole("checkbox").first().check();
    await client.getByRole("button", { name: "Create account" }).click();
    await expect(client.getByRole("heading", { name: "Check your email" })).toBeVisible({ timeout: 60_000 });

    // The verification email is not sent locally: verify the row like the dev workflow does.
    const u = await db().query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [email]);
    const clientUserId = u.rows[0]?.id;
    expect(clientUserId).toBeTruthy();
    await db().query(`UPDATE "user" SET "emailVerified" = true WHERE id = $1`, [clientUserId]);
    // registered for cleanup through its client row / requests
    await clientSignIn(client, email, password);

    // 2. Request a quote-priced service.
    await client.goto("/dashboard/requests/new");
    await client.locator("[data-tour=service-picker] button", { hasText: "Quote" }).first().click();
    await client.getByRole("button", { name: /Continue/ }).click();
    await client.locator("#brief").fill("We need our FY2025 books reviewed: one ledger and one bank statement, about 12 transactions a quarter.");
    await client.getByRole("button", { name: /Continue/ }).click();
    await client.getByRole("button", { name: /Submit request/ }).click();
    await client.waitForURL(/\/dashboard\/requests\/[0-9a-f-]{36}/, { timeout: 60_000 });
    const requestId = client.url().match(/requests\/([0-9a-f-]{36})/)![1];
    trackRequest(requestId);
    const reqRow = await db().query<{ client_id: string; status: string; number: string }>(`SELECT client_id, status, number FROM service_request WHERE id = $1`, [requestId]);
    trackClient(reqRow.rows[0].client_id);
    expect(reqRow.rows[0].status).toBe("quote_requested");

    // 3. Admin prices it from the request and sends it.
    await enrolTwoStep(adminPage.request, admin);
    await adminPage.goto(`/admin/billing/invoices/new?requestId=${requestId}`);
    await adminPage.locator('input[type="number"]').nth(1).fill("250000");
    await adminPage.getByRole("button", { name: /^Send / }).click();
    await adminPage.waitForURL(/\/admin\/billing\/invoices\/[0-9a-f-]{36}/, { timeout: 60_000 });
    await expect
      .poll(async () => (await db().query(`SELECT status FROM service_request WHERE id = $1`, [requestId])).rows[0].status, { timeout: 30_000 })
      .toBe("pending_payment");
    const inv = await db().query<{ invoice_id: string }>(`SELECT invoice_id FROM service_request WHERE id = $1`, [requestId]);
    const invoiceId = inv.rows[0].invoice_id;

    // 4a. Card: Paystack test-mode checkout is created (we stop at the redirect).
    await client.goto(`/dashboard/billing/pay?invoice=${invoiceId}`);
    const cardBtn = client.getByRole("button", { name: /with Paystack/ });
    if (await cardBtn.isEnabled()) {
      await client.route(/checkout\.paystack\.com/, (r) => r.fulfill({ status: 200, body: "paystack checkout (stubbed by e2e)" }));
      await cardBtn.click();
      await client.waitForURL(/checkout\.paystack\.com/, { timeout: 60_000 });
      await client.goto(`/dashboard/billing/pay?invoice=${invoiceId}`);
    }

    // 4b. Settle by bank transfer: upload the proof; the admin confirms it.
    await client.getByRole("radio", { name: /Bank transfer/ }).click();
    await client.locator("#proof").setInputFiles(PROOF);
    await expect(client.getByText(/received your receipt|We will confirm|waiting for us to confirm/i).first()).toBeVisible({ timeout: 60_000 });

    await adminPage.goto("/admin/billing/payments?view=confirm");
    await adminPage.getByRole("row").filter({ hasText: "Flowtest" }).first().click();
    await adminPage.getByRole("button", { name: /^Confirm .* received$/ }).click();
    await expect
      .poll(async () => (await db().query(`SELECT status FROM service_request WHERE id = $1`, [requestId])).rows[0].status, { timeout: 60_000 })
      .not.toBe("pending_payment");

    // 5. Client uploads the ledger on the request.
    await client.goto(`/dashboard/requests/${requestId}`);
    await client.locator('input[type="file"]').first().setInputFiles(LEDGER);
    await expect(client.getByText("ledger-bank.xlsx").first()).toBeVisible({ timeout: 90_000 });

    // 6. Admin opens it in the workbench and sends it as the final deliverable.
    await adminPage.goto(`/admin/analyses/w/new?requestId=${requestId}`);
    await expect(adminPage.getByRole("checkbox").first()).toBeChecked();
    await adminPage.getByRole("button", { name: "Open workbench" }).click();
    await adminPage.waitForURL(/\/admin\/analyses\/w\/wb-/, { timeout: 180_000 });
    await adminPage.getByRole("button", { name: /Send to client/ }).click();
    await adminPage.getByRole("radio", { name: /Final deliverable/ }).check();
    await adminPage.getByRole("dialog").getByRole("button", { name: /^Send final/ }).click();
    await expect
      .poll(async () => (await db().query(`SELECT status FROM service_request WHERE id = $1`, [requestId])).rows[0].status, { timeout: 180_000 })
      .toBe("delivered");

    // 7. The client sees it.
    await client.goto(`/dashboard/requests/${requestId}`);
    await expect(client.getByText(/ledger-bank\.xlsx/).first()).toBeVisible();
    await expect(client.getByText(/Delivered/i).first()).toBeVisible();

    await clientCtx.close();
    await adminCtx.close();
  });
});
