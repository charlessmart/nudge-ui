import { test } from "@playwright/test";
import { assertProductionContract } from "@nudge-ui/compatibility/playwright";

test("production build excludes the Nudge UI runtime contract", async ({ page }) => {
  await page.goto("/");
  await assertProductionContract(page);
});
