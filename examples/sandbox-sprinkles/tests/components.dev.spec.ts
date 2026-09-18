import { expect, test } from "@playwright/test";
import { openEditor } from "./editor.ts";

test("the Sprinkles component fixture exposes token-backed UI components", async ({ page }) => {
  const app = await openEditor(page, "/components");

  await expect(app.getByRole("heading", { name: /Sprinkles/ })).toBeVisible();
  await expect(app.locator('[data-test^="examples-components-spr-"]')).toHaveCount(6);
  await expect(app.locator(".sprinkles-ui-button")).toHaveCount(2);
});
