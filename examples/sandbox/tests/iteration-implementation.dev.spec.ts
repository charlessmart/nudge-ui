import { expect, test, type Page } from "@playwright/test";
import { clickFrameAction, waitForCanvasTransition } from "./canvasTransition.ts";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

async function createIteration(page: Page) {
  await page.goto("/playground");
  await expect(page.locator('[data-test="copy-iteration-implementation"]')).not.toBeAttached();
  await page.locator('[data-test="canvas-show-canvas"]').click();
  const cards = page.locator(".canvas-card");
  await clickFrameAction(page, cards.first().locator('[data-test^="canvas-card-create-iteration-"]'));
  await expect(cards).toHaveCount(2);
  await waitForCanvasTransition(page);
  const frame = cards.nth(1).locator("iframe");
  const heading = frame.contentFrame().locator("#hero-title");
  await expect(heading).toBeVisible();
  const artifactId = (await frame.getAttribute("src"))!.split("/")[3]!;
  return { heading, frame, artifactId };
}

test("iteration implementation copies the saved design and requested edits for the original app page", async ({ page }) => {
  const { heading, frame, artifactId } = await createIteration(page);
  await heading.dblclick();
  const editor = frame.contentFrame().locator('[data-inline-editor="true"]');
  await editor.fill("Live app implementation heading");
  await editor.press("Enter");
  await expect(page.locator('[data-test="copy-prompt-change-count"]')).toHaveText("1");

  const button = page.locator('[data-test="copy-prompt"]');
  const implementation = page.getByRole("menuitem", { name: /^Copy prompt for live app/ });
  await page.evaluate(() => navigator.clipboard.writeText("Existing clipboard"));
  await button.click();
  await expect(implementation).toContainText("Implement this design on /playground");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Existing clipboard");
  await implementation.click();
  await expect(page.getByRole("menu")).not.toBeAttached();
  await expect(button).toHaveAttribute("data-copied", "true");
  await expect(button).toContainText("Copied!");
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain("# Implement /playground · Iteration 1 in the live app");
  expect(prompt).toContain(`Page: ${new URL("/playground", page.url()).href}`);
  expect(prompt).toContain(`.nudge/artifacts/${artifactId}/document.html`);
  expect(prompt).toContain("including all saved visual edits");
  expect(prompt).toContain("Live app implementation heading");
  expect(prompt).toContain("Update application source");
  expect(prompt).not.toContain("Keep application source files unchanged");
  expect(prompt).not.toContain("Edit only");
  const saved = await page.request.get(`/__nudge_ui__/artifacts/${artifactId}/preview`);
  expect(await saved.text()).toContain("Live app implementation heading");
  await expect(page.locator('[data-test="copy-prompt-change-count"]')).not.toBeAttached();
  await expect(heading).toContainText("Live app implementation heading");

  await expect(button).toHaveAttribute("data-copied", "false");
  await button.click();
  await implementation.click();
  await expect(button).toHaveAttribute("data-copied", "true");
  const savedPrompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(savedPrompt).toContain(`.nudge/artifacts/${artifactId}/document.html`);
  expect(savedPrompt).not.toContain("No changes to export");

  await button.click();
  await page.getByRole("menu").press("Escape");
  await expect(page.getByRole("menu")).not.toBeAttached();
  await button.press("ArrowDown");
  const iteration = page.getByRole("menuitem", { name: /^Copy iteration prompt/ });
  await expect(iteration).toContainText("Continue editing this HTML iteration.");
  await expect(iteration).toBeFocused();
  await iteration.press("Enter");
  await expect(page.getByRole("menu")).not.toBeAttached();
  await expect(button).toHaveAttribute("data-copied", "true");
  const iterationPrompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(iterationPrompt).toContain(`Edit only \`.nudge/artifacts/${artifactId}/document.html\``);
  expect(iterationPrompt).toContain("Keep application source files unchanged");
  expect((await page.request.delete(`/__nudge_ui__/artifacts/${artifactId}`)).status()).toBe(204);
});

test("iteration implementation preserves pending edits and the clipboard when saving conflicts", async ({ page }) => {
  const { heading, frame, artifactId } = await createIteration(page);
  await heading.dblclick();
  const editor = frame.contentFrame().locator('[data-inline-editor="true"]');
  await editor.fill("Keep this pending design");
  await editor.press("Enter");
  await page.evaluate(() => navigator.clipboard.writeText("Existing clipboard"));
  await page.route(`**/artifacts/${artifactId}/commit`, (route) => route.fulfill({ status: 409 }));

  const button = page.locator('[data-test="copy-prompt"]');
  await button.click();
  await page.getByRole("menuitem", { name: /^Copy prompt for live app/ }).click();
  await expect(page.locator('[data-test="iteration-save-hint"]')).toContainText("Your visual edits are still pending");
  await expect(button).toHaveAttribute("data-copied", "false");
  await expect(button).toBeEnabled();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Existing clipboard");
  await expect(heading).toContainText("Keep this pending design");
  await expect(page.locator('[data-test="copy-prompt-change-count"]')).toHaveText("1");
  expect((await page.request.delete(`/__nudge_ui__/artifacts/${artifactId}`)).status()).toBe(204);
});
