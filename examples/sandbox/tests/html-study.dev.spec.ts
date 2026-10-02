import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("clearing study changes preserves the canvas until Reset canvas is used", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  const cards = page.locator(".canvas-card");
  await cards.first().locator('[data-test^="canvas-card-duplicate-"]').click();
  await cards.nth(1).locator('[data-test^="canvas-card-variation-"]').click();
  await expect(cards.nth(2).locator(".canvas-card__dimensions")).toContainText("HTML study");
  const study = cards.nth(2).locator("iframe");
  const studyUrl = await study.getAttribute("src");
  const heading = study.contentFrame().locator("h1").first();
  const original = await heading.textContent();
  await expect(cards.nth(2).locator('[data-test^="canvas-card-variation-"]')).toBeEnabled();
  await page.locator('[data-test="canvas-board-content"]').evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
  });
  await heading.dblclick();
  await study.contentFrame().locator('[data-inline-editor="true"]').fill("Reset this study edit");
  await study.contentFrame().locator('[data-inline-editor="true"]').press("Enter");
  await expect(heading).toContainText("Reset this study edit");
  await page.locator('[data-test="clear-session"]').click();
  await expect(cards).toHaveCount(3);
  await expect(heading).toHaveText(original!);
  await page.reload();
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(2).locator("iframe")).toHaveAttribute("src", studyUrl!);
  await page.locator('[data-test="settings-button"]').click();
  await page.locator('[data-test="settings-reset-canvas"]').click();
  // The current app route is recreated as the fresh starting frame.
  await expect(cards).toHaveCount(1);
  await expect(page.locator('[data-test="settings-dialog"]')).not.toBeVisible();
});

test("a live frame creates an additive persistent HTML variation", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await page.locator('[data-test="canvas-show-canvas"]').click();

  const cards = page.locator(".canvas-card");
  await expect(cards).toHaveCount(1);
  await cards.first().locator('[data-test^="canvas-card-duplicate-"]').click();
  await expect(cards).toHaveCount(2);
  const duplicate = cards.nth(1);
  await expect(duplicate.locator('[data-test^="canvas-card-variation-"]')).toBeEnabled();
  await duplicate.locator('[data-test^="canvas-card-variation-"]').click();
  await expect(page.locator(".canvas-card").nth(2).locator(".canvas-card__dimensions")).toContainText("HTML study", { timeout: 15_000 });
  await expect(page.locator('[data-test="copy-prompt"]')).toBeEnabled();

  const source = cards.first().locator("iframe");
  const study = cards.nth(2).locator("iframe");
  const studyUrl = await study.getAttribute("src");
  expect(studyUrl).toMatch(/^\/__nudge_ui__\/artifacts\/[a-f0-9-]{36}\/preview$/i);
  await expect(study.contentFrame().locator("h1").first()).toBeVisible();
  await expect(source.contentFrame().locator("h1").first()).toBeVisible();
  const originalHeading = await source.contentFrame().locator("h1").first().textContent();

  await expect(cards.nth(2).locator('[data-test^="canvas-card-variation-"]')).toBeEnabled();
  await page.locator('[data-test="canvas-board-content"]').evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
  });
  await study.contentFrame().locator("h1").first().dblclick();
  const editor = study.contentFrame().locator('[data-inline-editor="true"]');
  await expect(editor).toBeVisible();
  await editor.fill("Study variant");
  await editor.press("Enter");
  await expect(study.contentFrame().locator("h1").first()).toContainText("Study variant");
  await expect(source.contentFrame().locator("h1").first()).toHaveText(originalHeading ?? "");

  const artifactId = studyUrl!.split("/")[3]!;
  const baseline = await page.request.get(`/__nudge_ui__/artifacts/${artifactId}/baseline`);
  expect(baseline.ok()).toBe(true);
  expect(await baseline.text()).toContain("<h1");

  await expect(page.locator('[data-test="copy-prompt"]')).toHaveText(/Copy prompt/);
  await page.locator('[data-test="copy-prompt"]').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(`.nudge/artifacts/${artifactId}/document.html`);
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain(`.nudge/artifacts/${artifactId}/document.html`);
  expect(prompt).toContain("Study variant");
  expect(prompt).toContain("Edit only");
  expect(prompt).toContain("Keep application source files unchanged");
  await expect(study.contentFrame().locator("h1").first()).toContainText("Study variant");

  await page.reload();
  await expect(page.locator(".canvas-card")).toHaveCount(3);
  await expect(page.locator(".canvas-card").nth(2).locator("iframe")).toHaveAttribute("src", studyUrl!);
  await expect(page.locator(".canvas-card").nth(2).locator("iframe").contentFrame().locator("h1").first()).toContainText("Study variant");
  // Simulate an agent following the prompt and editing the actual file on disk.
  const documentPath = fileURLToPath(new URL(`../.nudge/artifacts/${artifactId}/document.html`, import.meta.url));
  const html = await readFile(documentPath, "utf8");
  await writeFile(documentPath, html.replace("Study variant", "Agent iteration"));
  await expect(page.locator(".canvas-card").nth(2).locator("iframe").contentFrame().locator("h1").first()).toContainText("Agent iteration", { timeout: 10_000 });
  await expect(page.locator(".canvas-card").first().locator("iframe").contentFrame().locator("h1").first()).toHaveText(originalHeading ?? "");
  expect((await page.request.delete(`/__nudge_ui__/artifacts/${artifactId}`)).status()).toBe(204);
});

test("an HTML study retains responsive layout after capture and prompt handoff", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await page.locator('.canvas-card').first().locator('[data-test^="canvas-card-duplicate-"]').click();
  const duplicate = page.locator('.canvas-card').nth(1);
  let iframe = duplicate.locator("iframe");
  await expect(iframe.contentFrame().locator("h1").first()).toBeVisible();
  await iframe.contentFrame().locator("body").evaluate((body) => {
    const style = body.ownerDocument.createElement("style");
    style.textContent = `
      #responsive-study { position: fixed; inset: 0; height: 200px; container-type: inline-size; }
      #responsive-study .grid { display: grid; grid-template-columns: 1fr 1fr; }
      #responsive-study .compact { color: rgb(200, 0, 0); }
      @media (max-width: 600px) { #responsive-study .grid { grid-template-columns: 1fr; } }
      @container (max-width: 600px) { #responsive-study .compact { color: rgb(0, 128, 0); } }
    `;
    body.ownerDocument.head.append(style);
    const fixture = body.ownerDocument.createElement("section");
    fixture.id = "responsive-study";
    fixture.innerHTML = '<div class="grid"><span>One</span><span>Two</span></div><div class="fluid" style="width: 50%">Fluid</div><div class="compact">Container query</div>';
    body.append(fixture);
  });
  await iframe.contentFrame().locator("body").evaluate((body) => {
    // Nudge projections live in CSSOM and have no corresponding style text.
    const overrides = body.ownerDocument.querySelector<HTMLStyleElement>("#nudge-ui-styles")!;
    overrides.sheet!.insertRule("#responsive-study .fluid { letter-spacing: 3px; }");
  });
  await duplicate.locator('[data-test^="canvas-card-variation-"]').click();
  await expect(page.locator(".canvas-card").nth(2).locator(".canvas-card__dimensions")).toContainText("HTML study", { timeout: 15_000 });
  iframe = page.locator(".canvas-card").nth(2).locator("iframe");
  const studyUrl = await iframe.getAttribute("src");
  const artifactId = studyUrl!.split("/")[3]!;
  try {
    const layout = () => iframe.contentFrame().locator("#responsive-study").evaluate((section) => {
      const view = section.ownerDocument.defaultView!;
      return {
        columns: view.getComputedStyle(section.querySelector(".grid")!).gridTemplateColumns.split(" ").length,
        fluidWidth: section.querySelector(".fluid")!.getBoundingClientRect().width,
        letterSpacing: view.getComputedStyle(section.querySelector(".fluid")!).letterSpacing,
        color: view.getComputedStyle(section.querySelector(".compact")!).color,
      };
    });
    await iframe.evaluate((element: HTMLIFrameElement) => { element.style.width = "1000px"; });
    await expect.poll(layout).toEqual({ columns: 2, fluidWidth: 500, letterSpacing: "3px", color: "rgb(200, 0, 0)" });
    await iframe.evaluate((element: HTMLIFrameElement) => { element.style.width = "400px"; });
    await expect.poll(layout).toEqual({ columns: 1, fluidWidth: 200, letterSpacing: "3px", color: "rgb(0, 128, 0)" });

    // Saving at the narrow size must not freeze the next editing base there.
    await page.locator('[data-test="copy-prompt"]').click();
    await expect(page.locator('[data-test="copy-prompt"]')).toContainText("Copied!");
    await expect(iframe.contentFrame().locator("#responsive-study")).toBeVisible();
    await iframe.evaluate((element: HTMLIFrameElement) => { element.style.width = "1000px"; });
    await expect.poll(layout).toEqual({ columns: 2, fluidWidth: 500, letterSpacing: "3px", color: "rgb(200, 0, 0)" });
  } finally {
    await page.request.delete(`/__nudge_ui__/artifacts/${artifactId}`);
  }
});


test("linked duplicates move as one group and variations preserve the group", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await page.locator('[data-test="canvas-show-canvas"]').click();
  const cards = page.locator(".canvas-card");
  await cards.first().locator('[data-test^="canvas-card-duplicate-"]').click();
  expect(await cards.nth(1).evaluate((element) => element.getAnimations().map((animation) => animation.effect?.getTiming().duration))).toContain(300);
  await cards.nth(1).locator('[data-test^="canvas-card-duplicate-"]').click();
  await expect(cards).toHaveCount(3);
  const group = page.locator('[data-test="canvas-linked-group"]');
  await expect(group).toHaveCount(1);
  const positions = () => cards.evaluateAll((elements) => elements.map((element) => ({
    x: Number.parseFloat((element as HTMLElement).style.left),
    y: Number.parseFloat((element as HTMLElement).style.top),
    width: Number.parseFloat((element as HTMLElement).style.width),
  })));
  const before = await positions();
  const bar = await group.boundingBox();
  expect(bar).not.toBeNull();
  await page.mouse.move(bar!.x + bar!.width / 2, bar!.y + bar!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar!.x + bar!.width / 2 + 35, bar!.y + bar!.height / 2 + 25, { steps: 4 });
  await page.mouse.up();
  const moved = await positions();
  expect(moved[0]!.x).toBeGreaterThan(before[0]!.x);
  expect(moved[0]!.y).toBeGreaterThan(before[0]!.y);
  expect(moved[1]!.x - moved[0]!.x).toBe(before[1]!.x - before[0]!.x);
  expect(moved[2]!.x - moved[1]!.x).toBe(before[2]!.x - before[1]!.x);

  // The card toolbar still selects, but cannot drag a linked member away.
  const dragSurface = cards.nth(1).locator('[data-test^="canvas-card-drag-"]');
  await dragSurface.dispatchEvent("pointerdown", { button: 0, pointerId: 1, clientX: 300, clientY: 200 });
  await page.mouse.move(420, 300);
  await page.mouse.up();
  expect(await positions()).toEqual(moved);

  await cards.nth(1).locator('[data-test^="canvas-card-variation-"]').click();
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(3).locator(".canvas-card__dimensions")).toContainText("HTML study", { timeout: 15_000 });
  await expect(group).toHaveText(/Linked frames3/);
  const after = await positions();
  expect(after.slice(0, 3)).toEqual(moved);
  expect(after[3]!.x).toBe(moved[1]!.x);
  expect(after[3]!.y).toBeGreaterThan(moved[1]!.y);
  await expect(cards.nth(3)).not.toHaveAttribute("data-linked-group-id");
  const artifactId = (await cards.nth(3).locator("iframe").getAttribute("src"))!.split("/")[3]!;
  await page.request.delete(`/__nudge_ui__/artifacts/${artifactId}`);
});

for (const modifier of ["Alt"] as const) {
  test(`${modifier}-drag adds a variation from a linked frame without moving its source`, async ({ page }) => {
    await page.goto("/playground");
    await page.locator('[data-test="canvas-show-canvas"]').click();
    const cards = page.locator(".canvas-card");
    await cards.first().locator('[data-test^="canvas-card-duplicate-"]').click();
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(1).locator('[data-test^="canvas-card-variation-"]')).toBeEnabled();
    await page.locator('[data-test="canvas-board-content"]').evaluate(async (element) => {
      await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
    });
    const content = page.locator('[data-test="canvas-board-content"]');
    const cameraBefore = await content.evaluate((element: HTMLElement) => element.style.transform);
    await content.evaluate((element) => {
      const observer = new MutationObserver(() => {
        const card = element.querySelectorAll<HTMLElement>(".canvas-card")[2];
        if (!card) return;
        card.dataset.testEntranceAnimations = String(card.getAnimations().length);
        observer.disconnect();
      });
      observer.observe(element, { childList: true, subtree: true });
    });
    const before = await cards.nth(1).evaluate((element: HTMLElement) => ({ x: element.style.left, y: element.style.top }));
    await cards.nth(1).hover();
    const toolbar = await cards.nth(1).locator('[data-test^="canvas-card-drag-"]').boundingBox();
    await page.keyboard.down(modifier);
    await page.mouse.move(toolbar!.x + toolbar!.width / 2, toolbar!.y + toolbar!.height / 2);
    await page.mouse.down();
    await page.mouse.move(toolbar!.x + toolbar!.width / 2 + 100, toolbar!.y + toolbar!.height / 2 + 150, { steps: 5 });
    await expect(cards).toHaveCount(3);
    await expect(page.locator(".canvas-card__variation-preview")).toHaveCount(0);
    await expect(cards.nth(2).locator("iframe")).toBeVisible();
    const duringDrag = await cards.nth(2).evaluate((element: HTMLElement) => ({ x: element.style.left, y: element.style.top }));
    await page.mouse.move(toolbar!.x + toolbar!.width / 2 + 160, toolbar!.y + toolbar!.height / 2 + 190, { steps: 5 });
    await expect.poll(() => cards.nth(2).evaluate((element: HTMLElement) => ({ x: element.style.left, y: element.style.top }))).not.toEqual(duringDrag);
    await page.mouse.up();
    await page.keyboard.up(modifier);
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(2)).toHaveAttribute("data-test-entrance-animations", "0");
    expect(await content.evaluate((element: HTMLElement) => element.style.transform)).toBe(cameraBefore);
    await expect(page.locator('[data-test="canvas-board"]')).not.toHaveClass(/is-layout-transitioning/);
    expect(await cards.nth(1).evaluate((element: HTMLElement) => ({ x: element.style.left, y: element.style.top }))).toEqual(before);
    await expect(cards.nth(2).locator(".canvas-card__dimensions")).toContainText("HTML study");
    await expect(page.locator('[data-test="canvas-linked-group"]')).toHaveText(/Linked frames2/);
    const dropped = await cards.nth(2).evaluate((element: HTMLElement) => ({ x: Number.parseFloat(element.style.left), y: Number.parseFloat(element.style.top) }));
    expect(dropped.x).toBeGreaterThan(Number.parseFloat(before.x));
    expect(dropped.y).toBeGreaterThan(Number.parseFloat(before.y));
    const artifactId = (await cards.nth(2).locator("iframe").getAttribute("src"))!.split("/")[3]!;
    await page.keyboard.press("Control+z");
    await expect(cards).toHaveCount(2);
    await page.keyboard.press("Control+Shift+z");
    await expect(cards).toHaveCount(3);
    expect(await cards.nth(2).evaluate((element: HTMLElement) => ({ x: Number.parseFloat(element.style.left), y: Number.parseFloat(element.style.top) }))).toEqual(dropped);
    await page.request.delete(`/__nudge_ui__/artifacts/${artifactId}`);
  });
}
