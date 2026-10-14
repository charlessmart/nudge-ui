import { test, expect } from "@playwright/test";
import { openEditor } from "@nudge-ui/compatibility/playwright";

test("dev: data-cid / data-src / data-cprops injected on JSX elements", async ({ page }) => {
  const app = await openEditor(page, "/playground");

  const button = app.locator("button").first();
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("data-cid", "Button");
  const src = await button.getAttribute("data-src");
  expect(src).toBeTruthy();
  expect(src!).toMatch(/Button\.tsx:\d+:\d+$/);
  // onClick={onClick} is a bare identifier and is omitted, so data-cprops holds only className.
  const cprops = await button.getAttribute("data-cprops");
  expect(cprops).toBeTruthy();
  expect(cprops!).toContain("className:btn");
  expect(cprops!).not.toContain("onClick:fn");

  const appDiv = app.locator('[data-cid="App"]').first();
  await expect(appDiv).toBeVisible();
  await expect(appDiv).toHaveAttribute("data-src", /.+/);
  await expect(appDiv).toHaveAttribute("data-cprops", "className:site-shell");
});
