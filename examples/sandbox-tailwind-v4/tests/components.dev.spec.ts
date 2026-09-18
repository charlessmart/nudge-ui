import { expect, test } from "@playwright/test";
import { openEditor } from "@nudge-ui/compatibility/playwright";

test("the shadcn gallery renders every installed registry component", async ({ page }) => {
  const app = await openEditor(page, "/components");

  await expect(app.getByRole("heading", { name: /Every component/ })).toBeVisible();
  await expect(app.getByText("61 components")).toBeVisible();
  await expect(app.locator('[data-test="shadcn-item"]')).toHaveCount(1);
  await expect(app.locator('[data-test^="shadcn-"]')).toHaveCount(61);
});
