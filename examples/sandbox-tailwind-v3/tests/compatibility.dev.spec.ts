import { test } from "@playwright/test";
import { runCompatibilityManifest } from "@design-tool/compatibility/playwright";
import { compatibilityManifest } from "../src/compatibility-manifest";
test("Tailwind v3 satisfies the shared compatibility corpus", async ({ page }) => {
  await runCompatibilityManifest(page, compatibilityManifest);
});

