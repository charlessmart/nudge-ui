import { test } from "@playwright/test";
import { assertProductionContract } from "@design-tool/compatibility/playwright";

test("Sprinkles production preview strips Design Tool", async ({ page }) => {
  await page.goto("/examples");
  await assertProductionContract(page);
});
