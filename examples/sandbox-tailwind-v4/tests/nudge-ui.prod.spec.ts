import { test } from "@playwright/test";
import { assertProductionContract } from "@nudge-ui/compatibility/playwright";
test("Tailwind v4 production preview strips Nudge UI", async ({ page }) => {
  await page.goto("/examples");
  await assertProductionContract(page);
});
