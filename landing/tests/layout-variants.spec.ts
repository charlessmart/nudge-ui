import { expect, test } from "@playwright/test";

const slugs = ["centered", "split", "sidebar", "interlocked", "blueprint"];

for (const slug of slugs) {
  test(`layout ${slug} renders the hero and all six bento cells without overflow`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/layouts/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name: /design panel/ })).toBeVisible();
    await expect(page.locator(".lv-cell:not(.lv-cell--hero)")).toHaveCount(6);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

test("layouts index lists every variant", async ({ page }) => {
  await page.goto("/layouts");
  await expect(page.locator(".lv-index-list a")).toHaveCount(slugs.length);
});
