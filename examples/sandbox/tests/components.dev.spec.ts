import { expect, test } from "@playwright/test";
import { openEditor } from "./editor.ts";

test("the raw CSS component fixture exposes local UI components", async ({ page }) => {
  const app = await openEditor(page, "/components");

  await expect(app.getByRole("heading", { name: /Raw CSS/ })).toBeVisible();
  await expect(app.locator('[data-test^="examples-components-raw-"]')).toHaveCount(7);
  await expect(app.locator(".semantic-button")).toHaveCount(2);
});
