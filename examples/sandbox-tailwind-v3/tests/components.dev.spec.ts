import { expect, test } from "@playwright/test";
import { openEditor } from "@nudge-ui/compatibility/playwright";

test("the Tailwind v3 component fixture exposes typed UI examples", async ({ page }) => {
  const app = await openEditor(page, "/components");

  await expect(app.getByRole("heading", { name: /Tailwind v3/ })).toBeVisible();
  await expect(app.locator('[data-test^="examples-components-tw3-"]')).toHaveCount(6);
  await expect(app.getByText("Tailwind v3 utilities")).toBeVisible();
});
