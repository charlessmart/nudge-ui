import { expect, test } from "@playwright/test";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("opens the first line of the multiline hero heading and removes the edit outline", async ({ page }) => {
  await page.goto("/playground");

  const hero = page.locator("h1#hero-title");
  await hero.dblclick({ position: { x: 80, y: 30 } });

  const host = page.locator('[data-inline-editor="true"]');
  await expect(host).toHaveText("Inspect the work");
  await expect(page.locator('[data-test="selected-outline"]')).toHaveCount(0);
  await expect(host).toHaveCSS("outline-style", "none");

  await host.fill("Inspect the interface");
  await host.press("Enter");
  await expect(hero).toContainText("Inspect the interface");
  await expect(hero.locator("br")).toHaveCount(1);
});

test("edits direct text before a line break without flattening the following markup", async ({ page }) => {
  await page.goto("/playground");

  const showcaseTitle = page.locator("h2#showcase-title");
  await showcaseTitle.dblclick({ position: { x: 80, y: 30 } });

  const host = page.locator('[data-inline-editor="true"]');
  await expect(host).toHaveText("Everything here is");
  await host.fill("Everything here remains");
  await host.press("Enter");

  await expect(showcaseTitle).toContainText("Everything here remains");
  await expect(showcaseTitle.locator("br")).toHaveCount(1);
  await expect(showcaseTitle.locator(".accent-word")).toHaveText("selectable.");
});

test("edits a unique component label inline and keeps one canonical change", async ({ page }) => {
  await page.goto("/component-props");

  const button = page.getByRole("button", { name: "Publish changes" });
  await button.dblclick();

  await expect(page.locator('[data-test="inline-text-editor"]')).toHaveCount(0);

  const host = page.locator('[data-inline-editor="true"]');
  await expect(host).toHaveAttribute("contenteditable", "plaintext-only");
  await host.pressSequentially("Publish now");
  await host.press("Enter");

  const updatedButton = page.getByRole("button", { name: "Publish now" });
  await expect(updatedButton).toHaveText("Publish now");
  const changes = page.locator('[data-test="changes-log"]');
  await changes.locator('[data-test="changes-toggle"]').click();
  await expect(changes.locator('[data-test="change-row"]')).toHaveCount(1);
  await expect(changes.locator('[data-test="change-row"]')).toContainText("Label");

  await page.locator('[data-test="copy-prompt"]').click();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain("## Component prop changes");
  expect(prompt).toContain("`label`: `Publish changes` → `Publish now`");
  expect(prompt).toContain("replace the invocation prop literal");

  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  const frame = page.frameLocator(".canvas-card__iframe").first();
  await expect(frame.getByRole("button", { name: "Publish now" })).toHaveCount(1);

  await changes.locator('[data-test="change-revert"]').click();
  await expect(frame.getByRole("button", { name: "Publish changes" })).toHaveCount(1);
});

test("cancels an inline children edit without a change", async ({ page }) => {
  await page.goto("/component-props");
  const badge = page.locator('[data-test="semantic-badge"]').filter({ hasText: "Neutral" });
  await badge.dblclick();
  await expect(page.locator('[data-test="inline-text-editor"]')).toHaveCount(0);

  const host = page.locator('[data-inline-editor="true"]');
  await host.fill("Changed but cancelled");
  await host.press("Escape");
  await expect(page.locator('[data-test="semantic-badge"]').filter({ hasText: "Neutral" })).toHaveText("Neutral");
  await expect(page.locator('[data-test="inline-text-editor"]')).toHaveCount(0);
  await expect(page.locator('[data-test="changes-log"] [data-test="change-row"]')).toHaveCount(0);
});

test("falls back to rendered text, restores after refresh, and supports prompt/revert", async ({ page }) => {
  await page.goto("/component-props");

  const copy = page.locator('[data-test="rendered-text-fallback"]');
  await copy.dblclick();
  await expect(page.locator('[data-test="inline-text-editor"]')).toHaveCount(0);

  const host = page.locator('[data-inline-editor="true"]');
  await host.fill("Updated rendered copy");
  await host.press("Enter");
  await expect(copy).toHaveText("Updated rendered copy");

  // Edit persistence is deliberately debounced; wait for the durable session
  // write before exercising the refresh path.
  await expect.poll(() => page.evaluate(() =>
    Object.values(localStorage).some((value) => value.includes("Updated rendered copy"))
  )).toBe(true);
  await page.reload();
  const refreshedCopy = page.locator('[data-test="rendered-text-fallback"]');
  await expect(refreshedCopy).toHaveText("Updated rendered copy");

  const changes = page.locator('[data-test="changes-log"]');
  await changes.locator('[data-test="changes-toggle"]').click();
  await expect(changes.locator('[data-test="change-row"]')).toHaveCount(1);
  await expect(changes.locator('[data-test="change-row"]')).toContainText("Rendered text");
  await page.locator('[data-test="copy-prompt"]').click();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain("## Rendered text changes");
  expect(prompt).toContain("`This copy has no semantic prop contract.` → `Updated rendered copy`");
  expect(prompt).not.toContain("Selectors (fallback)");

  await changes.locator('[data-test="change-revert"]').click();
  await expect(refreshedCopy).toHaveText("This copy has no semantic prop contract.");
});

test("re-enters a rendered text projection after it is committed empty", async ({ page }) => {
  await page.goto("/component-props");

  const copy = page.locator('[data-test="rendered-text-fallback"]');
  await copy.dblclick();
  const host = page.locator('[data-inline-editor="true"]');
  await host.fill("");
  await host.press("Enter");

  await expect(copy).toHaveText("");
  const affordance = page.locator('[data-empty-text]');
  await expect(affordance).toBeVisible();
  await expect(affordance).toHaveCSS("border-style", "none");

  await affordance.dblclick();
  // An empty native editing host has no glyph and therefore no layout box;
  // it is focused and attached while the inspector slot supplies the hit area.
  await expect(host).toHaveCount(1);
  await host.pressSequentially("Restored from empty");
  await host.press("Enter");
  await expect(copy).toHaveText("Restored from empty");
  await expect(page.locator('[data-empty-text]')).toHaveCount(0);

  const changes = page.locator('[data-test="changes-log"]');
  await changes.locator('[data-test="changes-toggle"]').click();
  await expect(changes.locator('[data-test="change-row"]')).toHaveCount(1);
  await page.locator('[data-test="copy-prompt"]').click();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain("`This copy has no semantic prop contract.` → `Restored from empty`");

  await changes.locator('[data-test="change-revert"]').click();
  await expect(copy).toHaveText("This copy has no semantic prop contract.");
});

test("projects rendered text into Canvas and reapplies it after frame reload", async ({ page }) => {
  await page.goto("/component-props");
  const copy = page.locator('[data-test="rendered-text-fallback"]');
  await copy.dblclick();
  const host = page.locator('[data-inline-editor="true"]');
  await host.fill("Canvas rendered copy");
  await host.press("Enter");

  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  const frame = page.frameLocator(".canvas-card__iframe").first();
  await expect(frame.locator('[data-test="rendered-text-fallback"]')).toHaveText("Canvas rendered copy");
  await expect(frame.locator('[data-projection-text]')).toHaveCount(1);

  await page.locator('[data-test^="canvas-card-reload-"]').click();
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible({ timeout: 20000 });
  await expect(frame.locator('[data-test="rendered-text-fallback"]')).toHaveText("Canvas rendered copy");
  await expect(frame.locator('[data-projection-text]')).toHaveCount(1);
});

test("keeps repeated expression text instance-scoped and projects the evidence into Canvas", async ({ page }) => {
  await page.goto("/component-props");
  const list = page.locator('[data-test="repeated-expression-list"]');
  const buttons = list.locator('[data-test="semantic-button"]');
  const first = buttons.nth(0);
  const second = buttons.nth(1);
  await expect(first).toHaveText("Expression A");
  await expect(second).toHaveText("Expression B");
  await first.dblclick();

  await expect(page.locator('[data-test="inline-text-editor"]')).toHaveCount(0);
  await expect(page.locator('[data-test="inline-scope-chooser"]')).toHaveCount(0);
  const host = page.locator('[data-inline-editor="true"]');
  await host.fill("Expression edited");
  await host.press("Enter");
  await expect(first).toHaveText("Expression edited");
  await expect(second).toHaveText("Expression B");

  const changes = page.locator('[data-test="changes-log"]');
  await changes.locator('[data-test="changes-toggle"]').click();
  await expect(changes.locator('[data-test="change-row"]')).toContainText("This rendered item only");
  await page.locator('[data-test="copy-prompt"]').click();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain("preserve the expression and update its source logic");
  expect(prompt).toContain("2 mounted outputs");

  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  const frame = page.frameLocator(".canvas-card__iframe").first();
  await expect(frame.locator('[data-test="repeated-expression-list"] [data-test="semantic-button"]').filter({ hasText: "Expression edited" })).toHaveCount(1);
  await expect(frame.locator('[data-test="repeated-expression-list"] [data-test="semantic-button"]').filter({ hasText: "Expression B" })).toHaveCount(1);
});

test("shows the repeated literal scope choice and applies explicit all-output scope in Canvas", async ({ page }) => {
  await page.goto("/component-props");
  const list = page.locator('[data-test="repeated-literal-list"]');
  const buttons = list.locator('[data-test="semantic-button"]');
  await buttons.first().dblclick();

  await expect(page.locator('[data-test="inline-scope-chooser"]')).toBeVisible();
  await expect(page.locator('[data-test="inline-scope-rendered-instance"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-test="inline-scope-source-site"]')).toHaveAttribute("aria-pressed", "false");
  await page.locator('[data-test="inline-scope-source-site"]').click();
  await expect(page.locator('[data-test="inline-scope-source-site"]')).toHaveAttribute("aria-pressed", "true");

  const host = page.locator('[data-inline-editor="true"]');
  await host.fill("All literal outputs");
  await host.press("Enter");
  await expect(buttons).toHaveCount(2);
  await expect(buttons).toHaveText(["All literal outputs", "All literal outputs"]);

  const changes = page.locator('[data-test="changes-log"]');
  await changes.locator('[data-test="changes-toggle"]').click();
  await expect(changes.locator('[data-test="change-row"]')).toContainText("All outputs at source site");
  await page.locator('[data-test="copy-prompt"]').click();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain("scope: all outputs at this source site");
  expect(prompt).toContain("2 mounted outputs");

  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  const frame = page.frameLocator(".canvas-card__iframe").first();
  await expect(frame.locator('[data-test="repeated-literal-list"] [data-test="semantic-button"]')).toHaveText(["All literal outputs", "All literal outputs"]);
});

test("requires an inline semantic chooser and rejects identical unresolved rendered roots", async ({ page }) => {
  await page.goto("/component-props");
  const ambiguous = page.locator('[data-test="semantic-ambiguous-text"]');
  await ambiguous.dblclick();
  await expect(page.locator('[data-test="inline-binding-chooser"]')).toBeVisible();
  await expect(page.locator('[data-test="inline-binding-choice"]')).toHaveCount(2);
  await page.locator('[data-test="inline-binding-choice"]').first().click();
  const host = page.locator('[data-inline-editor="true"]');
  await host.fill("Chosen semantic value");
  await host.press("Enter");
  await expect(ambiguous).toHaveText("Chosen semantic value / Ambiguous text");
  const changes = page.locator('[data-test="changes-log"]');
  await changes.locator('[data-test="changes-toggle"]').click();
  await expect(changes.locator('[data-test="change-row"]')).toHaveCount(1);
  await expect(changes.locator('[data-test="change-row"]')).toContainText("First");

  const identical = page.locator('[data-test="identical-rendered-root"]').filter({ hasText: "Identical root" }).first();
  await identical.dblclick();
  await expect(page.locator('[data-test="inline-text-editor"]')).toHaveCount(0);
  await expect(changes.locator('[data-test="change-row"]')).toHaveCount(1);

  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  const frame = page.frameLocator(".canvas-card__iframe").first();
  await expect(frame.locator('[data-test="semantic-ambiguous-text"]')).toHaveText("Chosen semantic value / Ambiguous text");
  await expect(frame.locator('[data-test="identical-rendered-root"]')).toHaveText(["Identical root", "Identical root"]);
});

test("applies the second equal semantic binding visibly and carries it into Canvas", async ({ page }) => {
  await page.goto("/component-props");
  const ambiguous = page.locator('[data-test="semantic-ambiguous-text"]');
  await ambiguous.dblclick();
  await expect(page.locator('[data-test="inline-binding-choice"]')).toHaveCount(2);
  await page.locator('[data-test="inline-binding-choice"]').nth(1).click();
  const host = page.locator('[data-inline-editor="true"]');
  await host.fill("Chosen second semantic value");
  await host.press("Enter");
  await expect(ambiguous).toHaveText("Ambiguous text / Chosen second semantic value");

  const changes = page.locator('[data-test="changes-log"]');
  await changes.locator('[data-test="changes-toggle"]').click();
  await expect(changes.locator('[data-test="change-row"]')).toHaveCount(1);
  await expect(changes.locator('[data-test="change-row"]')).toContainText("Second");

  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  const frame = page.frameLocator(".canvas-card__iframe").first();
  await expect(frame.locator('[data-test="semantic-ambiguous-text"]')).toHaveText("Ambiguous text / Chosen second semantic value");
});

test("uses before-text evidence to edit one of distinct repeated rendered roots", async ({ page }) => {
  await page.goto("/component-props");
  const roots = page.locator('[data-test="distinct-rendered-root"]');
  const first = roots.nth(0);
  const second = roots.nth(1);
  await expect(first).toHaveText("Distinct A");
  await expect(second).toHaveText("Distinct B");
  await first.dblclick();
  await expect(page.locator('[data-test="inline-text-editor"]')).toHaveCount(0);
  const host = page.locator('[data-inline-editor="true"]');
  await host.fill("Distinct edited");
  await host.press("Enter");
  await expect(first).toHaveText("Distinct edited");
  await expect(second).toHaveText("Distinct B");
});

test("edits an exact nested icon label, pastes plaintext, and suppresses the app action", async ({ page }) => {
  await page.goto("/component-props");
  const button = page.locator('[data-test="nested-icon-label"]');
  await expect(button.locator("svg path")).toHaveCount(1);
  await button.dblclick();
  const host = page.locator('[data-inline-editor="true"]');
  await expect(host).toBeVisible();

  // A click on the interactive host must not invoke the page button while the
  // inspector owns the draft.
  await button.click();
  await expect(host).toBeVisible();
  await expect(button.locator('[data-test="nested-icon-label-text"]')).toHaveText("Save");

  await host.selectText();
  await page.evaluate(() => {
    const target = document.querySelector('[data-inline-editor="true"]');
    if (!(target instanceof HTMLElement)) throw new Error("inline host missing");
    const transfer = new DataTransfer();
    transfer.setData("text/plain", "Pasted label");
    target.dispatchEvent(new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    }));
  });
  await expect(host).toHaveText("Pasted label");
  await host.press("Enter");
  await expect(button.locator('[data-test="nested-icon-label-text"]')).toHaveText("Pasted label");
  await expect(button.locator("svg path")).toHaveCount(1);
  await expect(page.locator('[data-inline-editor="true"]')).toHaveCount(0);
});

test("commits on native focus transfer while suppressing an outside app action", async ({ page }) => {
  await page.goto("/component-props");
  const target = page.locator('[data-test="nested-icon-label"]');
  await target.dblclick();
  const host = page.locator('[data-inline-editor="true"]');
  await host.fill("Committed from outside");

  await page.locator('[data-test="inline-outside-action"]').click();

  await expect(page.locator('[data-inline-editor="true"]')).toHaveCount(0);
  await expect(target.locator('[data-test="nested-icon-label-text"]')).toHaveText("Committed from outside");
  await expect(page.locator('[data-test="inline-outside-action"]')).toHaveText("Outside action 0");
  await expect(target.locator('[data-test="nested-icon-label-text"]')).not.toHaveText(/Clicked/);
});

test("keeps IME composition as one canonical edit and cancels on app reconciliation", async ({ page }) => {
  await page.goto("/component-props");
  const button = page.locator('[data-test="nested-icon-label"]');
  await button.dblclick();
  const host = page.locator('[data-inline-editor="true"]');
  await page.evaluate(() => {
    const target = document.querySelector('[data-inline-editor="true"]');
    if (!(target instanceof HTMLElement)) throw new Error("inline host missing");
    target.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    target.textContent = "公開ラベル";
    target.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertCompositionText",
      data: "公開ラベル",
    }));
    target.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
  });
  await host.press("Enter");
  await expect(button.locator('[data-test="nested-icon-label-text"]')).toHaveText("公開ラベル");
  await expect(page.locator('[data-test="change-row"]')).toHaveCount(1);

  await button.dblclick();
  await page.evaluate(() => document.querySelector('[data-test="nested-icon-label"]')?.remove());
  await expect(page.locator('[data-inline-editor="true"]')).toHaveCount(0);
});

test("disposes the active controller edit before entering Canvas", async ({ page }) => {
  await page.goto("/component-props");
  const button = page.locator('[data-test="nested-icon-label"]');
  await button.dblclick();
  const host = page.locator('[data-inline-editor="true"]');
  await host.fill("Draft that must not enter Canvas");

  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await expect(page.locator('[data-inline-editor="true"]')).toHaveCount(0);
  const frame = page.frameLocator(".canvas-card__iframe").first();
  await expect(frame.locator('[data-test="nested-icon-label-text"]')).toHaveText("Save");
  await expect(page.locator('[data-test="changes-log"] [data-test="change-row"]')).toHaveCount(0);
});

test("disposes an active edit through the scoped SPA history adapter", async ({ page }) => {
  await page.goto("/component-props");
  const button = page.getByRole("button", { name: "Publish changes" });
  await button.dblclick();
  await expect(page.locator('[data-inline-editor="true"]')).toHaveCount(1);

  await page.evaluate(() => {
    window.history.pushState({}, "", `${window.location.pathname}#inline-route`);
  });
  await expect(page.locator('[data-inline-editor="true"]')).toHaveCount(0);
  await expect(button).toHaveText("Publish changes");
});

test("cleans text editing state across Canvas reload and card disposal", async ({ page }) => {
  await page.goto("/component-props");
  const button = page.locator('[data-test="nested-icon-label"]');
  await button.dblclick();
  const host = page.locator('[data-inline-editor="true"]');
  await host.fill("Canvas-safe label");
  await host.press("Enter");
  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  const frame = page.frameLocator(".canvas-card__iframe").first();
  await expect(frame.locator('[data-test="nested-icon-label-text"]')).toHaveText("Canvas-safe label");
  await expect(frame.locator('[data-inline-editor="true"]')).toHaveCount(0);
  await page.locator('[data-test^="canvas-card-reload-"]').click();
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible({ timeout: 20000 });
  await expect(frame.locator('[data-test="nested-icon-label-text"]')).toHaveText("Canvas-safe label");
  await expect(frame.locator('[data-inline-editor="true"]')).toHaveCount(0);
});
