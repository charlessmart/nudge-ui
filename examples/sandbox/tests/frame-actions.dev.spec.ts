import { expect, test } from "@playwright/test";
import { waitForCanvasTransition } from "./canvasTransition.ts";

test("frame actions appear on preview hover and keep working when the pointer enters the toolbar", async ({ page }) => {
  await page.goto("/playground?nudge-ui=on");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  const cards = page.locator(".canvas-card");
  const original = cards.first();
  const actions = original.getByRole("toolbar", { name: "Frame actions" });
  await page.mouse.move(1200, 600);
  await expect(actions).not.toBeVisible();
  await expect(original.locator(".canvas-card__identity button")).toHaveCount(0);
  await expect(original.locator('[data-test^="canvas-card-live-"]')).toBeVisible();
  await original.locator("iframe").hover({ position: { x: 120, y: 200 } });
  await expect(actions).toBeVisible();
  await expect(original.locator(".canvas-card__floating-toolbar")).toHaveCSS("opacity", "1");
  await expect(actions.getByRole("button", { name: "Delete frame", exact: true })).toBeDisabled();
  await actions.hover();
  await expect(actions).toBeVisible();
  await actions.getByRole("button", { name: "Focus", exact: true }).click();
  await waitForCanvasTransition(page);
  await expect(page.locator('[data-test="canvas-workspace"]')).toHaveAttribute("data-presentation", "focus");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  await original.hover();
  await actions.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(cards).toHaveCount(2);
  await waitForCanvasTransition(page);
  const duplicate = cards.nth(1);
  await duplicate.hover();
  await duplicate.getByRole("button", { name: "Delete frame", exact: true }).click();
  await expect(cards).toHaveCount(1);
});

test("keyboard focus reveals frame actions and leaving the frame hides them", async ({ page }) => {
  await page.goto("/playground?nudge-ui=on");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  await page.mouse.move(1200, 600);
  const card = page.locator(".canvas-card").first();
  const actions = card.getByRole("toolbar", { name: "Frame actions" });
  await card.focus();
  await expect(actions).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(actions.getByRole("button", { name: "Focus", exact: true })).toBeFocused();
  await page.locator('[data-test="canvas-tool-design"]').focus();
  await expect(actions).not.toBeVisible();
  await expect(card.locator('[data-test^="canvas-card-live-"]')).toBeVisible();
});

test("Delete after DOM navigation removes the selected icon and undo restores it", async ({ page }) => {
  await page.goto("/playground?nudge-ui=on");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  const cards = page.locator(".canvas-card");
  await cards.first().hover();
  await cards.first().getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(cards).toHaveCount(2);
  await waitForCanvasTransition(page);
  await cards.nth(1).hover();
  await cards.nth(1).getByRole("button", { name: "Focus", exact: true }).click();
  await waitForCanvasTransition(page);
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  const selectedFrameId = await cards.nth(1).getAttribute("data-card-id");
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).toHaveCount(0);
  const frame = cards.nth(1).locator("iframe").contentFrame();
  const link = frame.getByRole("link", { name: "See how it works", exact: true });
  const icon = link.locator("span");
  await link.click();
  await page.getByRole("button", { name: "Open DOM navigator" }).click();
  await page.getByRole("menuitem").filter({ hasText: /^span$/ }).click();
  await expect(page.locator(".dom-navigator__label")).toHaveText("span");

  await page.keyboard.press("Delete");

  await expect(cards).toHaveCount(2);
  await expect(cards.nth(1)).toHaveAttribute("data-card-id", selectedFrameId!);
  await expect(icon).toHaveCount(0);
  await expect(link).toHaveText("See how it works");
  await page.keyboard.press("Meta+z");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(1)).toHaveAttribute("data-card-id", selectedFrameId!);
  await expect(icon).toHaveText("↓");
});

test("keyboard frame deletion supports undo and redo and keeps the final frame", async ({ page }) => {
  await page.goto("/playground?nudge-ui=on");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  const cards = page.locator(".canvas-card");
  await cards.first().hover();
  await cards.first().getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(cards).toHaveCount(2);
  await waitForCanvasTransition(page);
  const removedId = await cards.nth(1).getAttribute("data-card-id");
  await cards.nth(1).focus();

  await page.keyboard.press("Backspace");
  await expect(cards).toHaveCount(1);
  await page.keyboard.press("Meta+z");
  await expect(cards).toHaveCount(2);
  await expect(page.locator(`[data-card-id="${removedId}"]`)).toHaveClass(/is-selected/);
  await page.keyboard.press("Meta+Shift+z");
  await expect(cards).toHaveCount(1);
  await cards.first().focus();
  await page.keyboard.press("Delete");
  await expect(cards).toHaveCount(1);
});
