import { test, expect } from "@playwright/test";

test("dev: inspector shell mounts in Shadow DOM and toggles via Alt+I", async ({ page }) => {
  await page.goto("/");

  const hasMount = await page.evaluate(() => {
    const el = document.getElementById("design-tool-root");
    return el !== null;
  });
  expect(hasMount).toBe(true);

  const hasShadow = await page.evaluate(() => {
    return document.getElementById("design-tool-root")?.shadowRoot !== null;
  });
  expect(hasShadow).toBe(true);

  const hasShellText = await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    return sr?.textContent ?? "";
  });
  expect(hasShellText).toContain("Inspector shell ready");

  const getOpen = () =>
    page.evaluate(
      () =>
        document
          .getElementById("design-tool-root")
          ?.shadowRoot?.querySelector(".dt-panel")
          ?.getAttribute("data-open") ?? null,
    );

  const before = await getOpen();
  await page.keyboard.press("Alt+i");
  const afterToggle = await getOpen();
  expect(afterToggle).not.toBe(before);

  await page.keyboard.press("Alt+i");
  const afterSecond = await getOpen();
  expect(afterSecond).toBe(before);
});