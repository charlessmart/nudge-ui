import { expect, test } from "@playwright/test";

const slugs = ["narrow-split", "narrow-stage", "narrow-stacked", "full-below", "full-bleed", "full-framed"];

for (const slug of slugs) {
  test(`hero variant ${slug} plays the edit loop`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/hero/${slug}`);
    await expect(page.getByRole("heading", { name: /design panel/ })).toBeVisible();
    const stage = page.locator(".hm-stage");
    await expect(stage).toBeVisible();
    await expect(stage.locator(".hm-card")).toHaveCSS("padding-top", "12px");
    await expect(stage.locator('[data-t="chip"]')).toHaveAttribute("data-gone", "true", { timeout: 20_000 });
    expect(errors).toEqual([]);
  });
}

test("hero index lists every variant", async ({ page }) => {
  await page.goto("/hero");
  await expect(page.locator(".hv-index-list a")).toHaveCount(slugs.length);
});
