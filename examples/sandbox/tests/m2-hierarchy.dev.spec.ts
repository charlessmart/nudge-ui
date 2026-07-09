import { test, expect } from "@playwright/test";

async function activeBreadcrumbStep(page: import("@playwright/test").Page): Promise<string | null> {
  return await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const step = sr?.querySelector('[data-test="breadcrumb-step"][data-active="true"]') ?? null;
    if (!step) return null;
    return step.getAttribute("data-cid") ?? step.textContent ?? null;
  });
}

test("dev: hierarchy stepping walks the component boundary chain", async ({ page }) => {
  await page.goto("/");

  await page.click("text=Save");

  const panelText = await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    return sr?.textContent ?? "";
  });
  expect(panelText).toContain("Button");

  await page.keyboard.press("ArrowUp");
  expect(await activeBreadcrumbStep(page)).toBe("App");

  await page.keyboard.press("ArrowDown");
  expect(await activeBreadcrumbStep(page)).toBe("Button");

  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  expect(await activeBreadcrumbStep(page)).toBe("App");

  await page.keyboard.press("ArrowUp");
  expect(await activeBreadcrumbStep(page)).toBe("App");

  const appStep = await page.evaluateHandle(() => {
    const sr = document.getElementById("design-tool-root")!.shadowRoot!;
    return sr.querySelector('[data-test="breadcrumb-step"][data-cid="App"]') as HTMLElement;
  });
  await appStep.asElement()!.click();

  expect(await activeBreadcrumbStep(page)).toBe("App");
});