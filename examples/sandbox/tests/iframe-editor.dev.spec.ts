import { expect, test } from "@playwright/test";

test("dev: opens a pure editor shell with one fitted application iframe", async ({ page }) => {
  await page.goto("/playground");

  await expect(page).toHaveURL(/[?&]nudge-ui=editor(?:&|#|$)/);
  const iframe = page.locator('[data-test^="canvas-card-iframe-"]');
  await expect(iframe).toHaveCount(1);
  await expect(page.locator('[data-test^="canvas-card-open-app-"]')).toHaveCount(0);
  await expect(page.locator('[data-test^="canvas-card-resize-"]')).toHaveCount(0);

  const shell = await page.evaluate(() => ({
    editor: document.documentElement.hasAttribute("data-nudge-ui-editor"),
    appRootCount: document.querySelectorAll("#root").length,
    bodyMarginRight: getComputedStyle(document.body).marginRight,
  }));
  expect(shell).toEqual({ editor: true, appRootCount: 0, bodyMarginRight: "0px" });

  const app = page.frameLocator('[data-test^="canvas-card-iframe-"]');
  await expect(app.getByRole("button", { name: "Save" })).toBeVisible();
  await expect.poll(async () => iframe.getAttribute("title")).not.toBe("Nudge UI");

  const layout = await page.evaluate(() => {
    const root = document.getElementById("nudge-ui-root")?.shadowRoot;
    const board = root?.querySelector<HTMLElement>('[data-test="canvas-board"]');
    const card = root?.querySelector<HTMLElement>(".canvas-card");
    const content = root?.querySelector<HTMLElement>('[data-test="canvas-board-content"]');
    if (!board || !card || !content) return null;
    return {
      horizontalInset: board.clientWidth - card.offsetWidth,
      verticalInset: board.clientHeight - card.offsetHeight,
      transform: getComputedStyle(content).transform,
    };
  });
  expect(layout).toEqual({
    horizontalInset: 0,
    verticalInset: 0,
    transform: "none",
  });
});

test("dev: switches the same responsive iframe between Focus and Canvas", async ({ page }) => {
  await page.goto("/playground");
  const iframe = page.locator('[data-test^="canvas-card-iframe-"]');
  await expect(iframe).toBeVisible();
  await expect(page.frameLocator('[data-test^="canvas-card-iframe-"]').locator("#hero-title")).toBeVisible();
  await iframe.evaluate((element) => {
    const frame = element as HTMLIFrameElement;
    (window as Window & { __focusFrame?: Window | null }).__focusFrame = frame.contentWindow;
    if (frame.contentWindow) (frame.contentWindow as Window & { __focusSentinel?: string }).__focusSentinel = "retained";
  });
  await page.evaluate(() => {
    const scope = window as Window & { __focusWidthProbe?: { initial: number; samples: number[]; done: boolean } };
    const frame = document.getElementById("nudge-ui-root")?.shadowRoot?.querySelector<HTMLIFrameElement>('[data-test^="canvas-card-iframe-"]');
    if (!frame) throw new Error("Focus iframe did not mount");
    const probe = { initial: frame.clientWidth, samples: [] as number[], done: false };
    scope.__focusWidthProbe = probe;
    const startedAt = performance.now();
    const sample = (): void => {
      probe.samples.push(frame.clientWidth);
      if (performance.now() - startedAt >= 250) {
        probe.done = true;
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  await page.locator('[data-test="presentation-canvas"]').click();
  await page.waitForFunction(() => (
    window as Window & { __focusWidthProbe?: { done: boolean } }
  ).__focusWidthProbe?.done === true);
  const widthProbe = await page.evaluate(() => (
    window as Window & { __focusWidthProbe?: { initial: number; samples: number[] } }
  ).__focusWidthProbe);
  expect(widthProbe?.samples.every((width) => width === widthProbe.initial)).toBe(true);
  await expect(page.locator('[data-test^="canvas-card-resize-"]')).toBeAttached();
  await expect(page.locator('[data-test="presentation-focus"]')).toBeVisible();
  await expect.poll(() => page.locator('[data-test="canvas-board-content"]').evaluate((element: HTMLElement) => element.style.transform))
    .toContain("scale(0.75)");

  await page.locator('[data-test="presentation-focus"]').click();
  await expect(page.locator('[data-test^="canvas-card-resize-"]')).toHaveCount(0);
  const retained = await iframe.evaluate((element) => {
    const frame = element as HTMLIFrameElement;
    return frame.contentWindow === (window as Window & { __focusFrame?: Window | null }).__focusFrame
      && (frame.contentWindow as Window & { __focusSentinel?: string } | null)?.__focusSentinel === "retained";
  });
  expect(retained).toBe(true);

  await page.setViewportSize({ width: 1180, height: 760 });
  await expect.poll(async () => {
    const board = await page.locator('[data-test="canvas-board"]').boundingBox();
    const frame = await iframe.boundingBox();
    return board && frame ? { width: board.width - frame.width, height: board.height - frame.height } : null;
  }).toEqual({ width: 0, height: 0 });
});

test("dev: keeps hidden comparison geometry stable until Canvas reveal completes", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="presentation-canvas"]').click();
  await page.locator('[data-test^="canvas-card-duplicate-"]').first().click();
  const cards = page.locator(".canvas-card");
  await expect(cards).toHaveCount(2);
  const comparison = cards.nth(1);
  const storedGeometry = await comparison.evaluate((element: HTMLElement) => ({
    left: element.style.left,
    top: element.style.top,
    width: element.style.width,
    height: element.style.height,
  }));

  await page.locator('[data-test="presentation-focus"]').click();
  await expect(comparison).toHaveCSS("visibility", "hidden");
  await expect.poll(() => comparison.evaluate((element: HTMLElement) => ({
    left: element.style.left,
    top: element.style.top,
    width: element.style.width,
    height: element.style.height,
  }))).toEqual(storedGeometry);

  await page.evaluate(() => {
    const scope = window as Window & { __comparisonGeometryProbe?: { samples: string[]; done: boolean } };
    const cards = document.getElementById("nudge-ui-root")?.shadowRoot?.querySelectorAll<HTMLElement>(".canvas-card");
    const comparison = cards?.[1];
    if (!comparison) throw new Error("Comparison card did not mount");
    const probe = { samples: [] as string[], done: false };
    scope.__comparisonGeometryProbe = probe;
    const startedAt = performance.now();
    const sample = (): void => {
      probe.samples.push([comparison.style.left, comparison.style.top, comparison.style.width, comparison.style.height].join("|"));
      if (performance.now() - startedAt >= 250) {
        probe.done = true;
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.locator('[data-test="presentation-canvas"]').click();
  await page.waitForFunction(() => (
    window as Window & { __comparisonGeometryProbe?: { done: boolean } }
  ).__comparisonGeometryProbe?.done === true);
  const samples = await page.evaluate(() => (
    window as Window & { __comparisonGeometryProbe?: { samples: string[] } }
  ).__comparisonGeometryProbe?.samples ?? []);
  expect(new Set(samples)).toEqual(new Set([Object.values(storedGeometry).join("|")]));
  await expect(comparison).toHaveCSS("visibility", "visible");
});

test("dev: selecting another card makes its exact route the reload target", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="presentation-canvas"]').click();
  await page.locator('[data-test^="canvas-card-duplicate-"]').first().click();
  const frames = page.frameLocator(".canvas-card__iframe");
  await frames.nth(1).locator('a[href="/conformance"]').click();
  await expect.poll(() => frames.nth(1).locator("body").evaluate(() => location.pathname)).toBe("/conformance");
  await frames.nth(1).locator("body").evaluate(() => history.replaceState({}, "", "/conformance?probe=route#example"));
  await page.locator(".canvas-card").nth(1).locator('[data-test^="canvas-card-drag-"]').click();
  await expect.poll(() => {
    const url = new URL(page.url());
    return `${url.pathname}${url.search}${url.hash}`;
  }).toBe("/conformance?probe=route&nudge-ui=editor#example");

  await page.reload();
  await expect(page.locator(".canvas-card")).toHaveCount(2);
  await expect.poll(async () => {
    const locations = await page.locator(".canvas-card__iframe").evaluateAll((elements) => elements.map((element) => {
      const frame = element as HTMLIFrameElement;
      return frame.contentWindow ? `${frame.contentWindow.location.pathname}${frame.contentWindow.location.search}${frame.contentWindow.location.hash}` : "";
    }));
    return locations.filter((location) => location === "/conformance?probe=route#example").length;
  }).toBe(1);
});

test("dev: edits iframe text with commit, cancel, undo, and reload persistence", async ({ page }) => {
  await page.goto("/playground");
  const app = page.frameLocator('[data-test^="canvas-card-iframe-"]');
  const heading = app.locator("#hero-title");

  await heading.dblclick({ position: { x: 80, y: 30 } });
  const editor = app.locator('[data-inline-editor="true"]');
  await expect(editor).toHaveText("Inspect the work");
  await editor.fill("Inspect the iframe");
  await editor.press("Enter");
  await expect(heading).toContainText("Inspect the iframe");

  await heading.dblclick({ position: { x: 80, y: 30 } });
  await editor.fill("Discard this draft");
  await editor.press("Escape");
  await expect(heading).toContainText("Inspect the iframe");

  await heading.press("Control+z");
  await expect(heading).toContainText("Inspect the work");
  await heading.press("Control+Shift+z");
  await expect(heading).toContainText("Inspect the iframe");

  await page.locator('[data-test="presentation-canvas"]').click();
  await page.locator('[data-test^="canvas-card-reload-"]').click();
  await expect(app.locator("#hero-title")).toContainText("Inspect the iframe");
});

test("dev: re-enters an empty iframe text projection", async ({ page }) => {
  await page.goto("/playground");
  const app = page.frameLocator('[data-test^="canvas-card-iframe-"]');
  const heading = app.locator("#hero-title");

  await heading.dblclick({ position: { x: 80, y: 30 } });
  const editor = app.locator('[data-inline-editor="true"]');
  await editor.fill("");
  await editor.press("Enter");
  const emptyText = app.locator("[data-empty-text]");
  await expect(emptyText).toBeVisible();

  await emptyText.dblclick();
  await expect(editor).toBeVisible();
  await editor.fill("Restored iframe text");
  await editor.press("Enter");
  await expect(heading).toHaveText("Restored iframe text");
});

test("dev: keeps selection and style editing on the iframe document", async ({ page }) => {
  await page.goto("/playground");
  const app = page.frameLocator('[data-test^="canvas-card-iframe-"]');
  const button = app.locator("button.btn").first();
  await button.click();

  await expect(page.locator('[data-test="canvas-selected-outline"]')).toBeVisible();
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();
  await expect(page.locator('[data-test="token-field"][data-property="color"]')).toBeVisible();
});

test("dev: hands an active iframe draft to the next target without running app actions", async ({ page }) => {
  await page.goto("/playground");
  const app = page.frameLocator('[data-test^="canvas-card-iframe-"]');
  const button = app.locator("button.btn").first();
  const originalLabel = (await button.textContent())?.trim() ?? "";

  await button.dblclick();
  const editor = app.locator('[data-inline-editor="true"]');
  await editor.fill("Edited without action");
  await editor.click();
  await expect(app.locator('[data-test="click-counter"]')).toContainText("clicks: 0");

  await app.locator("#hero-title").dblclick({ position: { x: 80, y: 30 } });
  await expect(button).toContainText("Edited without action");
  await expect(editor).toHaveText("Inspect the work");
  await editor.press("Escape");
  await expect(app.locator('[data-test="click-counter"]')).toContainText("clicks: 0");
  expect(originalLabel).not.toBe("Edited without action");
});

test("dev: navigates the focused iframe without replacing the editor", async ({ page }) => {
  await page.goto("/playground");
  const iframe = page.locator('[data-test^="canvas-card-iframe-"]');
  const app = page.frameLocator('[data-test^="canvas-card-iframe-"]');

  await app.locator('a[href="/conformance"]').click();

  await expect(iframe).toHaveCount(1);
  await expect.poll(() => app.locator("body").evaluate(() => location.pathname)).toBe("/conformance");
  await expect(app.locator("body")).toBeVisible();
  await expect(page).toHaveURL(/[?&]nudge-ui=editor(?:&|#|$)/);

  await page.reload();
  await expect(iframe).toHaveCount(1);
  await expect.poll(() => app.locator("body").evaluate(() => location.pathname)).toBe("/conformance");
});

test("dev: toggles the inspector from frame focus and restores native app clicks", async ({ page }) => {
  await page.goto("/playground");
  const app = page.frameLocator('[data-test^="canvas-card-iframe-"]');
  const button = app.locator("button.btn").first();
  await button.click();

  await button.press("Control+Backslash");
  await expect(page.locator(".panel")).toHaveAttribute("data-open", "false");
  await expect(page.locator('[data-test="canvas-selected-outline"]')).toHaveCount(0);
  await expect(page.locator('[data-test="canvas-hover-outline"]')).toHaveCount(0);
  await button.click();
  await expect(app.locator('[data-test="click-counter"]')).toContainText("clicks: 1");

  await button.press("Control+Backslash");
  await expect(page.locator(".panel")).toHaveAttribute("data-open", "true");

  await page.locator('[data-test="collapse-inspector"]').click();
  await expect(page.locator(".panel")).toHaveAttribute("data-open", "false");
  await button.click();
  await expect(app.locator('[data-test="click-counter"]')).toContainText("clicks: 2");
  await page.locator('[data-test="show-inspector"]').click();
  await expect(page.locator(".panel")).toHaveAttribute("data-open", "true");
});

test("dev: keeps the selected outline aligned after canvas zoom", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="presentation-canvas"]').click();
  const app = page.frameLocator('[data-test^="canvas-card-iframe-"]');
  const button = app.locator("button.btn").first();
  await button.click();
  const outline = page.locator('[data-test="canvas-selected-outline"]');
  await expect(outline).toBeVisible();

  await page.mouse.move(500, 500);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 250);
  await page.keyboard.up("Control");

  await expect.poll(async () => {
    const targetBox = await button.boundingBox();
    const outlineBox = await outline.boundingBox();
    if (!targetBox || !outlineBox) return Number.POSITIVE_INFINITY;
    return Math.max(
      Math.abs(targetBox.x - outlineBox.x),
      Math.abs(targetBox.y - outlineBox.y),
      Math.abs(targetBox.width - outlineBox.width),
      Math.abs(targetBox.height - outlineBox.height),
    );
  }).toBeLessThan(2);
});
