import { test } from "@playwright/test";
import { runCompatibilityManifest } from "@design-tool/compatibility/playwright";
import { compatibilityManifest } from "../src/compatibility-manifest.ts";

test("real compiled fixture satisfies its compatibility manifest", async ({ page }) => {
  await runCompatibilityManifest(page, compatibilityManifest);
});
