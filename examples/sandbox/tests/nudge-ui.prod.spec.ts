import { test, expect } from "@playwright/test";
import { assertProductionContract } from "@nudge-ui/compatibility/playwright";

test("production build excludes the Nudge UI runtime contract", async ({ page }) => {
  await page.goto("/");
  await assertProductionContract(page);

  const applicationScripts = await page.evaluate(async () => {
    const sameOriginScripts = Array.from(document.scripts)
      .map((script) => script.src)
      .filter((src) => src && new URL(src).origin === window.location.origin);
    return Promise.all(sameOriginScripts.map(async (src) => fetch(src).then((response) => response.text())));
  });
  const bundledSource = applicationScripts.join("\n");
  expect(bundledSource).not.toContain("nudge_listen");
  expect(bundledSource).not.toContain("nudge-ui-agent-session");
  expect(bundledSource).not.toContain("canvas-command");
});
