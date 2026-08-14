import { test } from "@playwright/test";
import { assertProductionContract } from "@design-tool/compatibility/playwright";

test("production build excludes the Design Tool runtime contract", async ({ page }) => {
  await page.goto("/");
  await assertProductionContract(page);
});
