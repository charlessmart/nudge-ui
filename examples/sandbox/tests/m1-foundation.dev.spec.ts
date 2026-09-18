import { test, expect } from "@playwright/test";
import { openEditor } from "./editor.ts";

test("dev: data-cid / data-src / data-cprops injected on JSX elements", async ({ page }) => {
  const app = await openEditor(page, "/playground");

  const button = app.locator("button").first();
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("data-cid", "Button");
  // data-src points back into Button.tsx as relativePath:line:col.
  const src = await button.getAttribute("data-src");
  expect(src).toBeTruthy();
  expect(src!).toMatch(/Button\.tsx:\d+:\d+$/);
  // The rendered <button> carries className="btn" (a string literal) and
  // onClick={onClick} (a bare identifier — omitted per PLAN.md canonical example).
  // So data-cprops contains only the className entry.
  const cprops = await button.getAttribute("data-cprops");
  expect(cprops).toBeTruthy();
  expect(cprops!).toContain("className:btn");
  expect(cprops!).not.toContain("onClick:fn");

  const appDiv = app.locator('[data-cid="App"]').first();
  await expect(appDiv).toBeVisible();
  // The app shell's className is serialisable, so the identity contract
  // records it alongside data-cid and data-src.
  await expect(appDiv).toHaveAttribute("data-src", /.+/);
  await expect(appDiv).toHaveAttribute("data-cprops", "className:site-shell");
});
