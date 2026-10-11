import { test, expect } from "@playwright/test";
import { getAppFrame, openEditor } from "@nudge-ui/compatibility/playwright";

test("state selection previews hover and active only on the selected button and clears on reselection", async ({ page }) => {
  await openEditor(page, "/playground");
  const frame = await getAppFrame(page);
  await frame.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = `
      .state-preview-fixture { background: rgb(10, 20, 30); color: white; }
      .state-preview-fixture:hover { background: rgb(40, 50, 60); }
      .state-preview-fixture:active { background: rgb(70, 80, 90); }
      .state-preview-fixture:hover span { color: rgb(100, 110, 120); }
      .state-preview-fixture::before { content: ""; color: rgb(1, 2, 3); }
      .state-preview-fixture:active::before { color: rgb(4, 5, 6); }
    `;
    document.head.appendChild(style);
    for (const name of ["first", "second"]) {
      const button = document.createElement("button");
      button.className = "state-preview-fixture";
      button.dataset.test = `state-preview-${name}`;
      button.dataset.cid = "StatePreviewFixture";
      button.dataset.src = `state-preview.tsx:${name === "first" ? 1 : 2}:1`;
      const label = document.createElement("span");
      label.textContent = name;
      label.style.pointerEvents = "none";
      button.appendChild(label);
      document.body.prepend(button);
    }
  });
  const first = frame.locator('[data-test="state-preview-first"]');
  const second = frame.locator('[data-test="state-preview-second"]');
  await first.click();
  const state = page.locator('[data-test="style-state-select"]');
  await expect(state).toContainText("Base");
  await state.click();
  await page.locator('[data-value="hover"]').click();
  await expect(first).toHaveCSS("background-color", "rgb(40, 50, 60)");
  await expect(first.locator("span")).toHaveCSS("color", "rgb(100, 110, 120)");
  await expect(second).toHaveCSS("background-color", "rgb(10, 20, 30)");

  await state.click();
  await page.locator('[data-value="active"]').click();
  await expect(first).toHaveCSS("background-color", "rgb(70, 80, 90)");
  await expect.poll(() => first.evaluate((element) => getComputedStyle(element, "::before").color))
    .toBe("rgb(4, 5, 6)");

  // Managed edits must update the preview while the pointer stays in the panel.
  await frame.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = ".state-preview-fixture:active { background: rgb(130, 140, 150); }";
    document.head.appendChild(style);
  });
  await expect(first).toHaveCSS("background-color", "rgb(130, 140, 150)");

  await state.click();
  await page.locator('[data-value="base"]').click();
  await expect(first).toHaveCSS("background-color", "rgb(10, 20, 30)");
  await state.click();
  await page.locator('[data-value="hover"]').click();
  await expect(first).toHaveCSS("background-color", "rgb(40, 50, 60)");
  await second.click();
  await expect(first).toHaveCSS("background-color", "rgb(10, 20, 30)");
  await expect(state).toContainText("Base");
});

test("a button with only hover exposes the state dropdown", async ({ page }) => {
  await openEditor(page, "/playground");
  const frame = await getAppFrame(page);
  await frame.getByRole("button", { name: "Save a change", exact: true }).click();
  const state = page.locator('[data-test="style-state-select"]');
  await expect(state).toContainText("Base");
  await state.click();
  await expect(page.locator('[data-value="hover"]')).toBeVisible();
});
