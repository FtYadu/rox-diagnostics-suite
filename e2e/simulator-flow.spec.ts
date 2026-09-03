import { expect, test, type Page } from "@playwright/test";

const VIN = "LRX01TEST00000001";

const signIn = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel(/email/i).fill("tech@dealer.rox");
  const vinField = page.getByLabel(/vin/i).first();
  if (await vinField.count()) await vinField.fill(VIN);
  await page
    .getByRole("button", { name: /sign in|start/i })
    .first()
    .click();
  await expect(page).toHaveURL(/dashboard/);
};

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1180, height: 820 },
]) {
  test.describe(`${viewport.name} · simulator v1 flow`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("scan → DTC → clear → report → history", async ({ page }) => {
      await signIn(page);

      // Health scan
      await page.goto("/health-scan");
      await page.getByRole("button", { name: /scan/i }).first().click();
      await expect(page.getByText(/ECUs/i).first()).toBeVisible();

      // ECU detail: read and clear fault memory
      await page.goto("/ecus");
      await page
        .getByRole("link")
        .filter({ hasText: /CCU|BCM|IBCM/ })
        .first()
        .click();
      await expect(page.getByRole("tab", { name: /fault codes|DTCs/i })).toBeVisible();
      await page.getByRole("tab", { name: /fault codes|DTCs/i }).click();
      await page.getByRole("button", { name: /clear dtcs/i }).click();

      // Report
      await page.goto("/reports");
      await expect(page.getByText(new RegExp(VIN, "i")).first()).toBeVisible();

      // Job history records the work
      await page.goto("/job-history");
      await expect(page.getByText(new RegExp(VIN, "i")).first()).toBeVisible();
    });
  });
}
