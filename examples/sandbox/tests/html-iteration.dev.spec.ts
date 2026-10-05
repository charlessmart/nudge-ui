import { clickFrameAction, waitForCanvasTransition } from "./canvasTransition.ts";
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("clearing iteration changes preserves the canvas until Reset canvas is used", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  const cards = page.locator(".canvas-card");
  await clickFrameAction(page, cards.first().locator('[data-test^="canvas-card-duplicate-"]'));
  await clickFrameAction(page, cards.nth(1).locator('[data-test^="canvas-card-create-iteration-"]'));
  await expect(cards.nth(2).locator(".canvas-card__dimensions")).toContainText("HTML iteration");
  const iteration = cards.nth(2).locator("iframe");
  const iterationUrl = await iteration.getAttribute("src");
  const heading = iteration.contentFrame().locator("h1").first();
  const original = await heading.textContent();
  await expect(cards.nth(2).locator('[data-test^="canvas-card-create-iteration-"]')).toBeEnabled();
  await page.locator('[data-test="canvas-board-content"]').evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
  });
  await heading.dblclick();
  await iteration.contentFrame().locator('[data-inline-editor="true"]').fill("Reset this iteration edit");
  await iteration.contentFrame().locator('[data-inline-editor="true"]').press("Enter");
  await expect(heading).toContainText("Reset this iteration edit");
  await page.locator('[data-test="clear-session"]').click();
  await expect(cards).toHaveCount(3);
  await expect(heading).toHaveText(original!);
  await page.reload();
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(2).locator("iframe")).toHaveAttribute("src", iterationUrl!);
  await page.locator('[data-test="settings-button"]').click();
  await page.locator('[data-test="settings-reset-canvas"]').click();
  // The current app route is recreated as the fresh starting frame.
  await expect(cards).toHaveCount(1);
  await expect(page.locator('[data-test="settings-dialog"]')).not.toBeVisible();
});

test("a live frame creates an additive persistent HTML iteration", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await page.locator('[data-test="canvas-show-canvas"]').click();

  const cards = page.locator(".canvas-card");
  await expect(cards).toHaveCount(1);
  await clickFrameAction(page, cards.first().locator('[data-test^="canvas-card-duplicate-"]'));
  await expect(cards).toHaveCount(2);
  const duplicate = cards.nth(1);
  await expect(duplicate.locator('[data-test^="canvas-card-create-iteration-"]')).toBeEnabled();
  await clickFrameAction(page, duplicate.locator('[data-test^="canvas-card-create-iteration-"]'));
  await expect(page.locator(".canvas-card").nth(2).locator(".canvas-card__dimensions")).toContainText("HTML iteration", { timeout: 15_000 });
  await expect(page.locator('[data-test="copy-prompt"]')).toBeEnabled();

  const source = cards.first().locator("iframe");
  const iteration = cards.nth(2).locator("iframe");
  const iterationUrl = await iteration.getAttribute("src");
  expect(iterationUrl).toMatch(/^\/__nudge_ui__\/artifacts\/[a-f0-9-]{36}\/preview$/i);
  await expect(iteration.contentFrame().locator("h1").first()).toBeVisible();
  await expect(source.contentFrame().locator("h1").first()).toBeVisible();
  const originalHeading = await source.contentFrame().locator("h1").first().textContent();

  await expect(cards.nth(2).locator('[data-test^="canvas-card-create-iteration-"]')).toBeEnabled();
  await page.locator('[data-test="canvas-board-content"]').evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
  });
  await iteration.contentFrame().locator("h1").first().dblclick();
  const editor = iteration.contentFrame().locator('[data-inline-editor="true"]');
  await expect(editor).toBeVisible();
  await editor.fill("Iteration variant");
  await editor.press("Enter");
  await expect(iteration.contentFrame().locator("h1").first()).toContainText("Iteration variant");
  await expect(source.contentFrame().locator("h1").first()).toHaveText(originalHeading ?? "");

  // Pending intent restores from the iteration draft before it is materialized as HTML.
  await page.reload();
  await expect(iteration.contentFrame().locator("h1").first()).toContainText("Iteration variant");
  await expect(source.contentFrame().locator("h1").first()).toHaveText(originalHeading ?? "");

  const artifactId = iterationUrl!.split("/")[3]!;
  const baseline = await page.request.get(`/__nudge_ui__/artifacts/${artifactId}/baseline`);
  expect(baseline.ok()).toBe(true);
  expect(await baseline.text()).toContain("<h1");

  await expect(page.locator('[data-test="copy-prompt"]')).toHaveText(/Copy prompt/);
  await page.locator('[data-test="copy-prompt"]').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(`.nudge/artifacts/${artifactId}/document.html`);
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain(`.nudge/artifacts/${artifactId}/document.html`);
  expect(prompt).toContain("Iteration variant");
  expect(prompt).toContain("Edit only");
  expect(prompt).toContain("Keep application source files unchanged");
  await expect(iteration.contentFrame().locator("h1").first()).toContainText("Iteration variant");

  await page.reload();
  await expect(page.locator(".canvas-card")).toHaveCount(3);
  await expect(page.locator(".canvas-card").nth(2).locator("iframe")).toHaveAttribute("src", iterationUrl!);
  await expect(page.locator(".canvas-card").nth(2).locator("iframe").contentFrame().locator("h1").first()).toContainText("Iteration variant");
  // Simulate an agent following the prompt and editing the actual file on disk.
  const documentPath = fileURLToPath(new URL(`../.nudge/artifacts/${artifactId}/document.html`, import.meta.url));
  const html = await readFile(documentPath, "utf8");
  await writeFile(documentPath, html.replace("Iteration variant", "Agent iteration"));
  await expect(page.locator(".canvas-card").nth(2).locator("iframe").contentFrame().locator("h1").first()).toContainText("Agent iteration", { timeout: 10_000 });
  await expect(page.locator(".canvas-card").first().locator("iframe").contentFrame().locator("h1").first()).toHaveText(originalHeading ?? "");
  expect((await page.request.delete(`/__nudge_ui__/artifacts/${artifactId}`)).status()).toBe(204);
});

test("an HTML iteration retains responsive layout after capture and prompt handoff", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await clickFrameAction(page, page.locator('.canvas-card').first().locator('[data-test^="canvas-card-duplicate-"]'));
  const duplicate = page.locator('.canvas-card').nth(1);
  let iframe = duplicate.locator("iframe");
  await expect(iframe.contentFrame().locator("h1").first()).toBeVisible();
  await iframe.contentFrame().locator("body").evaluate((body) => {
    const style = body.ownerDocument.createElement("style");
    style.textContent = `
      #responsive-iteration { position: fixed; inset: 0; height: 200px; container-type: inline-size; }
      #responsive-iteration .grid { display: grid; grid-template-columns: 1fr 1fr; }
      #responsive-iteration .compact { color: rgb(200, 0, 0); }
      @media (max-width: 600px) { #responsive-iteration .grid { grid-template-columns: 1fr; } }
      @container (max-width: 600px) { #responsive-iteration .compact { color: rgb(0, 128, 0); } }
    `;
    body.ownerDocument.head.append(style);
    const fixture = body.ownerDocument.createElement("section");
    fixture.id = "responsive-iteration";
    fixture.innerHTML = '<div class="grid"><span>One</span><span>Two</span></div><div class="fluid" style="width: 50%">Fluid</div><div class="compact">Container query</div>';
    body.append(fixture);
  });
  await iframe.contentFrame().locator("body").evaluate((body) => {
    // Nudge projections live in CSSOM and have no corresponding style text.
    const overrides = body.ownerDocument.querySelector<HTMLStyleElement>("#nudge-ui-styles")!;
    overrides.sheet!.insertRule("#responsive-iteration .fluid { letter-spacing: 3px; }");
  });
  await clickFrameAction(page, duplicate.locator('[data-test^="canvas-card-create-iteration-"]'));
  await expect(page.locator(".canvas-card").nth(2).locator(".canvas-card__dimensions")).toContainText("HTML iteration", { timeout: 15_000 });
  iframe = page.locator(".canvas-card").nth(2).locator("iframe");
  const iterationUrl = await iframe.getAttribute("src");
  const artifactId = iterationUrl!.split("/")[3]!;
  try {
    const layout = () => iframe.contentFrame().locator("#responsive-iteration").evaluate((section) => {
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
    await expect(iframe.contentFrame().locator("#responsive-iteration")).toBeVisible();
    await iframe.evaluate((element: HTMLIFrameElement) => { element.style.width = "1000px"; });
    await expect.poll(layout).toEqual({ columns: 2, fluidWidth: 500, letterSpacing: "3px", color: "rgb(200, 0, 0)" });
  } finally {
    await page.request.delete(`/__nudge_ui__/artifacts/${artifactId}`);
  }
});


test("linked frames drag independently and iterations preserve their source layout", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await page.locator('[data-test="canvas-show-canvas"]').click();
  const cards = page.locator(".canvas-card");
  await clickFrameAction(page, cards.first().locator('[data-test^="canvas-card-duplicate-"]'));
  expect(await cards.nth(1).evaluate((element) => element.getAnimations().map((animation) => animation.effect?.getTiming().duration))).toContain(300);
  await clickFrameAction(page, cards.nth(1).locator('[data-test^="canvas-card-duplicate-"]'));
  await expect(cards).toHaveCount(3);

  const positions = () => cards.evaluateAll((elements) => elements.map((element) => ({
    x: Number.parseFloat((element as HTMLElement).style.left),
    y: Number.parseFloat((element as HTMLElement).style.top),
    width: Number.parseFloat((element as HTMLElement).style.width),
  })));
  await page.locator('[data-test="canvas-board-content"]').evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
  });
  const handle = cards.nth(1).locator(".canvas-card__dimensions");
  const outside = await handle.boundingBox();
  expect(outside).not.toBeNull();
  await page.locator('[data-test="canvas-board"]').dispatchEvent("wheel", {
    deltaX: outside!.x - 40, deltaY: outside!.y - 120, bubbles: true, composed: true,
  });
  await expect.poll(async () => (await handle.boundingBox())?.y ?? 0).toBeGreaterThan(100);
  const before = await positions();
  const bar = await handle.boundingBox();
  expect(bar).not.toBeNull();
  await page.mouse.move(bar!.x + bar!.width / 2, bar!.y + bar!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar!.x + bar!.width / 2 + 35, bar!.y + bar!.height / 2 + 25, { steps: 4 });
  await page.mouse.up();
  const moved = await positions();
  expect(moved[0]).toEqual(before[0]);
  expect(moved[2]).toEqual(before[2]);
  expect(moved[1]!.x).toBeGreaterThan(before[1]!.x);
  expect(moved[1]!.y).toBeGreaterThan(before[1]!.y);
  for (const card of await cards.all()) {
    await expect(card.locator(".canvas-card__frame")).toHaveCSS("outline-color", "rgb(168, 85, 247)");
  }
  await page.reload();
  await waitForCanvasTransition(page);
  expect(await positions()).toEqual(moved);

  await clickFrameAction(page, cards.nth(1).locator('[data-test^="canvas-card-create-iteration-"]'));
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(3).locator(".canvas-card__dimensions")).toContainText("HTML iteration", { timeout: 15_000 });
  await expect(cards.locator(".canvas-card__frame")).toHaveCount(4);
  for (const card of await cards.all()) {
    await expect(card.locator(".canvas-card__frame")).not.toHaveCSS("outline-color", "rgb(168, 85, 247)");
  }
  const after = await positions();
  expect(after.slice(0, 3)).toEqual(moved);
  expect(after[3]!.x).toBe(moved[1]!.x);
  expect(after[3]!.y).toBeGreaterThan(moved[1]!.y);
  const artifactId = (await cards.nth(3).locator("iframe").getAttribute("src"))!.split("/")[3]!;
  await page.request.delete(`/__nudge_ui__/artifacts/${artifactId}`);
});

for (const modifier of ["Alt"] as const) {
  test(`${modifier}-drag adds an iteration from a linked frame without moving its source`, async ({ page }) => {
    await page.goto("/playground");
    await page.locator('[data-test="canvas-show-canvas"]').click();
    const cards = page.locator(".canvas-card");
    await clickFrameAction(page, cards.first().locator('[data-test^="canvas-card-duplicate-"]'));
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(1).locator('[data-test^="canvas-card-create-iteration-"]')).toBeEnabled();
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
    const toolbar = await cards.nth(1).locator('.canvas-card__dimensions').boundingBox();
    await page.keyboard.down(modifier);
    await page.mouse.move(toolbar!.x + toolbar!.width / 2, toolbar!.y + toolbar!.height / 2);
    await page.mouse.down();
    await page.mouse.move(toolbar!.x + toolbar!.width / 2 + 100, toolbar!.y + toolbar!.height / 2 + 150, { steps: 5 });
    await expect(cards).toHaveCount(3);
    await expect(page.locator(".canvas-card__iteration-preview")).toHaveCount(0);
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
    await expect(cards.nth(2).locator(".canvas-card__dimensions")).toContainText("HTML iteration");
    await expect(cards.nth(2).locator(".canvas-card__frame")).not.toHaveCSS("outline-color", "rgb(168, 85, 247)");
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


test("a stale iteration handoff keeps pending edits and the agent's file", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  const cards = page.locator(".canvas-card");
  await clickFrameAction(page, cards.first().locator('[data-test^="canvas-card-create-iteration-"]'));
  const iteration = cards.nth(1).locator("iframe");
  await expect(cards.nth(1).locator('[data-test^="canvas-card-create-iteration-"]')).toBeEnabled();
  await page.locator('[data-test="canvas-board-content"]').evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
  });
  const iterationUrl = (await iteration.getAttribute("src"))!;
  const artifactId = iterationUrl.split("/")[3]!;
  const documentPath = fileURLToPath(new URL(`../.nudge/artifacts/${artifactId}/document.html`, import.meta.url));
  const heading = iteration.contentFrame().locator("h1").first();
  await heading.dblclick();
  const editor = iteration.contentFrame().locator('[data-inline-editor="true"]');
  await editor.fill("Pending browser design");
  await editor.press("Enter");
  await expect(heading).toContainText("Pending browser design");
  await expect(page.locator('[data-test="changes-log"]')).toContainText("Pending browser design");
  const storedHtml = await readFile(documentPath, "utf8");
  const agentHtml = storedHtml.replace(/(<h1\b[^>]*>)[\s\S]*?(<\/h1>)/i, "$1External agent design$2");
  expect(agentHtml).not.toBe(storedHtml);
  await writeFile(documentPath, agentHtml);
  try {
    await page.locator('[data-test="copy-prompt"]').click();
    await expect(page.locator('[data-test="iteration-save-hint"]')).toContainText("changed outside Nudge");
    expect(await readFile(documentPath, "utf8")).toBe(agentHtml);
    await expect(heading).toContainText("Pending browser design");
    await expect(page.locator('[data-test="changes-log"]')).toContainText("Pending browser design");

    // The conflicting browser design can be kept as a separate iteration.
    await clickFrameAction(page, cards.nth(1).locator('[data-test^="canvas-card-create-iteration-"]'));
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(2).locator("iframe").contentFrame().locator("h1").first()).toContainText("Pending browser design");
    // Pan back to the conflicting iteration, then reveal its hover toolbar.
    await page.locator('[data-test="canvas-board-content"]').evaluate(async (element) => {
      await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
    });
    const boardBox = (await page.locator('[data-test="canvas-board"]').boundingBox())!;
    const iterationBox = (await cards.nth(1).boundingBox())!;
    await page.locator('[data-test="canvas-board"]').dispatchEvent("wheel", {
      deltaY: iterationBox.y + iterationBox.height / 2 - boardBox.y - boardBox.height / 2,
      clientX: boardBox.x + boardBox.width / 2, clientY: boardBox.y + boardBox.height / 2,
    });
    await cards.nth(1).hover();
    await cards.nth(1).locator('[data-test^="canvas-card-drag-"]').click();
    await page.locator('[data-test="clear-session"]').click();
    await expect(heading).toContainText("External agent design", { timeout: 10000 });
    await expect(cards.nth(2).locator("iframe").contentFrame().locator("h1").first()).toContainText("Pending browser design");
    const copyId = (await cards.nth(2).locator("iframe").getAttribute("src"))!.split("/")[3]!;
    await page.request.delete(`/__nudge_ui__/artifacts/${copyId}`);
  } finally { await page.request.delete(`/__nudge_ui__/artifacts/${artifactId}`); }
});
