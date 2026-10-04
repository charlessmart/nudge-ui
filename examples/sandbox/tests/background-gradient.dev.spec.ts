import { expect, test } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";
import { appLocator, getAppFrame, openEditor } from "@nudge-ui/compatibility/playwright";

const SUBJECT = '[data-test="color-case-color-hex-six-digit"]';
function field(page: import("@playwright/test").Page, label: string) {
  return page.locator(`[data-test="token-field"][aria-label="${label}"] [data-test="raw-input"]`);
}

async function selectGradient(page: import("@playwright/test").Page): Promise<void> {
  await openEditor(page, "/color-conformance");
  const frame = await getAppFrame(page);
  await frame.addStyleTag({ content: `${SUBJECT} { --gradient-start: #ef4444; background-image: linear-gradient(35deg, var(--gradient-start) 0%, rgba(0, 0, 255, .4) 100%); }` });
  await appLocator(page, SUBJECT).click();
  await expect(field(page, "Gradient angle")).toHaveValue("35deg");
}

test("dev: edits computed gradients with color, opacity, angle, and stop controls", async ({ page }) => {
  await selectGradient(page);
  await field(page, "Gradient angle").fill("120");
  await field(page, "Gradient angle").blur();
  await expect.poll(() => appLocator(page, SUBJECT).evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("120deg");
  await page.getByRole("button", { name: "Add gradient stop", exact: true }).click();
  await field(page, "Stop 3 position").fill("70%");
  await field(page, "Stop 3 position").blur();
  await field(page, "Stop 3 color").fill("#00ff00");
  await field(page, "Stop 3 color").blur();
  const opacity = page.locator('[data-test="token-field"][aria-label="Stop 3 color"] [data-test="color-opacity-input"]');
  await opacity.fill("50%");
  await opacity.blur();
  await expect.poll(() => appLocator(page, SUBJECT).evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(/70%/);
  await expect(field(page, "Stop 3 color")).toHaveValue("#00ff00");
  await expect(opacity).toHaveValue("50%");
  await page.getByRole("button", { name: "Remove stop 3", exact: true }).click();
  await expect(field(page, "Stop 3 position")).toHaveCount(0);
});

test("dev: clicking the track adds stops and dragging preserves the selected color across other stops", async ({ page }) => {
  await selectGradient(page);
  const track = page.locator('[data-test="gradient-track"]');
  await track.click({ position: { x: 90, y: 8 } });
  await expect(field(page, "Stop 3 position")).toBeVisible();
  const bounds = await track.boundingBox();
  if (!bounds) throw new Error("Gradient track is not visible");
  const stop = page.getByRole("button", { name: "Gradient stop 1", exact: true });
  const pin = await stop.boundingBox();
  if (!pin) throw new Error("Gradient stop is not visible");
  await page.mouse.move(pin.x + pin.width / 2, pin.y + pin.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .9, pin.y + pin.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(field(page, "Stop 1 position")).toHaveValue("90%");
  await expect.poll(() => appLocator(page, SUBJECT).evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("rgb(239, 68, 68) 90%");
  await stop.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(field(page, "Stop 1 position")).toHaveValue("89%");
  await page.screenshot({ path: "/tmp/nudge-background-gradient.png" });
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => appLocator(page, SUBJECT).evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("90%");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(field(page, "Stop 1 position")).toHaveValue("0%");
});


test("dev: switches between image, solid, and new gradient backgrounds", async ({ page }) => {
  await selectGradient(page);
  await page.getByRole("button", { name: "Image", exact: true }).click();
  await page.locator('[data-test="background-image-upload"]').setInputFiles({
    name: "test-background.svg", mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#2563eb"/><circle cx="60" cy="40" r="25" fill="#ef4444"/></svg>'),
  });
  await expect(page.getByRole("button", { name: "Replace background image", exact: true })).toContainText("test-background.svg");
  await expect.poll(() => page.getByAltText("Background image thumbnail").evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight])).toEqual([120, 80]);
  await expect.poll(() => appLocator(page, SUBJECT).evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("data:image/svg+xml;base64,");
  await expect.poll(() => appLocator(page, SUBJECT).evaluate((el) => getComputedStyle(el).backgroundSize)).toBe("cover");
  await page.getByRole("combobox", { name: "Background image sizing", exact: true }).click();
  await page.getByRole("option", { name: "Fit", exact: true }).click();
  await expect.poll(() => appLocator(page, SUBJECT).evaluate((el) => getComputedStyle(el).backgroundSize)).toBe("contain");
  await page.screenshot({ path: "/tmp/nudge-image-background.png" });
  await page.getByRole("button", { name: "Solid", exact: true }).click();
  await expect.poll(() => appLocator(page, SUBJECT).evaluate((el) => getComputedStyle(el).backgroundImage)).toBe("none");
  await page.getByRole("button", { name: "Gradient", exact: true }).click();
  await expect(field(page, "Gradient angle")).toHaveValue("90deg");
  await expect.poll(() => appLocator(page, SUBJECT).evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("linear-gradient(90deg");
});


test("dev: gradient stop colors use the shared token picker and retain opacity when unlinked", async ({ page }) => {
  await selectGradient(page);
  const colorField = page.locator('[data-test="token-field"][aria-label="Stop 2 color"]');
  await field(page, "Stop 2 color").fill("--color-primary");
  await page.locator('[data-test="suggestion-item"]').filter({ hasText: "--color-primary" }).click();
  await expect(colorField.locator('[data-test="token-chip"]')).toContainText("--color-primary");
  const opacity = colorField.locator('[data-test="color-opacity-input"]');
  await expect(opacity).toHaveValue("40%");
  await expect.poll(() => managedSheetText(page)).toContain("var(--color-primary) 40%");
  await opacity.fill("60%");
  await opacity.blur();
  await expect.poll(() => managedSheetText(page)).toContain("var(--color-primary) 60%");
  await colorField.locator('[data-test="delink-btn"]').click();
  await expect(colorField.locator('[data-test="token-chip"]')).toHaveCount(0);
  await expect.poll(() => managedSheetText(page)).not.toContain("var(--color-primary)");
  await expect(opacity).toHaveValue("60%");
  await page.screenshot({ path: "/tmp/nudge-background-gradient-updated.png" });
});


test("dev: inspects an existing CSS image and undoes sizing changes", async ({ page }) => {
  await page.route("**/background-test.svg", (route) => route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="24"><rect width="48" height="24" fill="green"/></svg>',
  }));
  await openEditor(page, "/color-conformance");
  const frame = await getAppFrame(page);
  await frame.addStyleTag({ content: `${SUBJECT} { background-image: url("/background-test.svg"); background-size: contain; background-repeat: no-repeat; }` });
  await appLocator(page, SUBJECT).click();
  await expect(page.getByRole("button", { name: "Replace background image", exact: true })).toContainText("background-test.svg");
  await expect.poll(() => page.getByAltText("Background image thumbnail").evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight])).toEqual([48, 24]);
  const sizing = page.getByRole("combobox", { name: "Background image sizing", exact: true });
  await expect(sizing).toHaveText("Fit");
  await sizing.click();
  await page.getByRole("option", { name: "Tile", exact: true }).click();
  await expect.poll(() => appLocator(page, SUBJECT).evaluate((el) => getComputedStyle(el).backgroundRepeat)).toBe("repeat");
  await expect.poll(() => appLocator(page, SUBJECT).evaluate((el) => getComputedStyle(el).backgroundSize)).toBe("auto");
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => appLocator(page, SUBJECT).evaluate((el) => getComputedStyle(el).backgroundSize)).toBe("contain");
  await expect.poll(() => appLocator(page, SUBJECT).evaluate((el) => getComputedStyle(el).backgroundRepeat)).toBe("no-repeat");
  await expect(page.getByRole("button", { name: "Replace background image", exact: true })).toBeVisible();
});

test("dev: rejects an unreadable image without changing the background", async ({ page }) => {
  await selectGradient(page);
  await page.getByRole("button", { name: "Image", exact: true }).click();
  await page.locator('[data-test="background-image-upload"]').setInputFiles({
    name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not image data"),
  });
  await expect(page.getByRole("alert")).toContainText("This image could not be loaded");
  await expect(page.getByRole("button", { name: "Upload image", exact: true })).toBeEnabled();
  await expect.poll(() => appLocator(page, SUBJECT).evaluate((el) => getComputedStyle(el).backgroundImage)).toBe("none");
});
