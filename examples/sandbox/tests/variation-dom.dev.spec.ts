import { test, expect } from "@playwright/test";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("HTML variation DOM drags work and change counts describe final prompt intent", async ({ page }) => {
  await page.goto("/conformance");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  const cards = page.locator(".canvas-card");
  await expect(cards.first().locator('[data-test^="canvas-card-variation-"]')).toBeEnabled();
  await cards.first().locator("iframe").contentFrame().locator("body").evaluate((body) => {
    const fixture = body.ownerDocument.createElement("section");
    fixture.id = "variation-drag-fixture";
    fixture.style.cssText = "position:fixed;left:80px;top:100px;width:360px;background:white;z-index:1000;";
    fixture.innerHTML = '<div style="height:60px">First</div><div style="height:60px">Second</div><div style="height:60px">Third</div>';
    body.append(fixture);
  });
  await cards.first().locator('[data-test^="canvas-card-variation-"]').click();
  const study = cards.nth(1).locator("iframe");
  await expect(cards.nth(1).locator('[data-test^="canvas-card-variation-"]')).toBeEnabled();
  await page.locator('[data-test="canvas-board-content"]').evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
  });
  const fixture = study.contentFrame().locator("#variation-drag-fixture");
  await expect(fixture).toHaveAttribute("data-cid", /^nudge-ui-runtime-/);
  const children = fixture.locator(":scope > div");
  const order = () => children.allTextContents();
  async function dragBefore(target: string): Promise<void> {
    const from = await children.filter({ hasText: "Third" }).boundingBox();
    const to = await children.filter({ hasText: target }).boundingBox();
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(to!.x + to!.width / 2, to!.y + 3, { steps: 8 });
    await page.mouse.up();
  }
  await dragBefore("First");
  await expect.poll(order).toEqual(["Third", "First", "Second"]);
  await dragBefore("Second");
  await expect.poll(order).toEqual(["First", "Third", "Second"]);
  await expect(page.locator('[data-test="copy-prompt-change-count"]')).toHaveText("1");
  await expect(page.locator('[data-test="changes-log"] .changes__count')).toHaveText("1");
  await page.keyboard.press("Control+z");
  await expect.poll(order).toEqual(["Third", "First", "Second"]);
  await page.keyboard.press("Control+z");
  await expect.poll(order).toEqual(["First", "Second", "Third"]);
  await page.keyboard.press("Control+z");
  await expect(cards).toHaveCount(1);
  await page.keyboard.press("Control+Shift+z");
  await expect(cards).toHaveCount(2);
  await expect(fixture).toBeVisible();
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(order).toEqual(["Third", "First", "Second"]);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(order).toEqual(["First", "Third", "Second"]);
  await expect(page.locator('[data-test="copy-prompt-change-count"]')).toHaveText("1");
  await page.locator('[data-test="copy-prompt"]').click();
  await expect.poll(async () => {
    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    return prompt.split("\n").filter((line) => line.startsWith("- Move ")).length;
  }).toBe(1);
  await expect.poll(() => cards.first().locator("iframe").contentFrame().locator("#variation-drag-fixture > div").allTextContents()).toEqual(["First", "Second", "Third"]);
  const artifactId = (await study.getAttribute("src"))!.split("/")[3]!;
  await page.request.delete(`/__nudge_ui__/artifacts/${artifactId}`);
});

test("duplicates slide right and variations slide down with hover paused", async ({ page }) => {
  await page.goto("/conformance");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  const cards = page.locator(".canvas-card");
  async function captureEntrance(index: number): Promise<void> {
    await page.locator('[data-test="canvas-board-content"]').evaluate((board, index) => {
      const observer = new MutationObserver(() => {
        const card = board.querySelectorAll<HTMLElement>(".canvas-card")[index];
        if (!card) return;
        const frames = (card.getAnimations()[0]?.effect as KeyframeEffect | null)?.getKeyframes();
        if (!frames) return;
        card.dataset.testAnimationStart = JSON.stringify({
          interactionsPaused: board.parentElement!.classList.contains("is-layout-transitioning"),
          offsetX: parseFloat(card.style.left) - parseFloat(String(frames[0]?.left)),
          offsetY: parseFloat(card.style.top) - parseFloat(String(frames[0]?.top)),
          duration: card.getAnimations()[0]?.effect?.getTiming().duration,
          opacity: frames[0]?.opacity,
          finalOpacity: frames.at(-1)?.opacity,
        });
        observer.disconnect();
      });
      observer.observe(board, { childList: true, subtree: true });
    }, index);
  }
  await captureEntrance(1);
  await cards.first().locator('[data-test^="canvas-card-duplicate-"]').click();
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(1)).toHaveAttribute("data-test-animation-start", JSON.stringify({ interactionsPaused: true, offsetX: 200, offsetY: 0, duration: 300, opacity: "0", finalOpacity: "1" }));
  await page.locator('[data-test="canvas-board-content"]').evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
  });
  await expect.poll(() => page.locator('[data-test="canvas-board"]').evaluate((board) => {
    const viewport = board.getBoundingClientRect();
    const duplicate = board.querySelectorAll(".canvas-card")[1]!.getBoundingClientRect();
    return {
      x: Math.round(Math.abs(duplicate.x + duplicate.width / 2 - (viewport.x + viewport.width / 2))),
      y: Math.round(Math.abs(duplicate.y + duplicate.height / 2 - (viewport.y + viewport.height / 2))),
    };
  })).toEqual({ x: 0, y: 0 });
  await captureEntrance(2);
  await cards.nth(1).locator('[data-test^="canvas-card-variation-"]').click();
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(2)).toHaveAttribute("data-test-animation-start", JSON.stringify({ interactionsPaused: true, offsetX: 0, offsetY: 200, duration: 300, opacity: "0", finalOpacity: "1" }));
  const board = page.locator('[data-test="canvas-board"]');
  await expect(page.locator('[data-test="canvas-hover-outline"]')).toHaveCount(0);
  await expect(page.locator('[data-test="canvas-selected-outline"]')).toHaveCount(0);
  await page.locator('[data-test="canvas-board-content"]').evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
  });
  await expect(board).not.toHaveClass(/is-layout-transitioning/);
  await expect(cards.nth(2).locator("iframe")).toHaveCSS("pointer-events", "auto");
  const artifactId = (await cards.nth(2).locator("iframe").getAttribute("src"))!.split("/")[3]!;
  await page.request.delete(`/__nudge_ui__/artifacts/${artifactId}`);
});

test("linked sections and their controls retain canvas dimensions across zoom levels", async ({ page }) => {
  await page.goto("/conformance");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  const cards = page.locator(".canvas-card");
  await cards.first().locator('[data-test^="canvas-card-duplicate-"]').click();
  await expect(cards).toHaveCount(2);
  const content = page.locator('[data-test="canvas-board-content"]');
  await content.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
  });
  const dimensions = () => content.evaluate((element) => {
    const section = element.querySelector<HTMLElement>('[data-test="canvas-linked-group"]')!;
    const header = section.querySelector<HTMLElement>(".canvas-frame-section__heading")!;
    const button = section.querySelector<HTMLElement>('[data-test^="canvas-card-focus-"]')!;
    const frames = [...section.querySelectorAll<HTMLElement>(".canvas-card")].map((frame) => frame.getBoundingClientRect());
    const sectionRect = section.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const zoom = new DOMMatrixReadOnly(getComputedStyle(element).transform).a;
    return {
      zoom,
      sectionWidth: sectionRect.width / zoom,
      sectionHeight: sectionRect.height / zoom,
      leftPadding: (frames[0]!.left - sectionRect.left) / zoom,
      rightPadding: (sectionRect.right - frames.at(-1)!.right) / zoom,
      topPadding: (frames[0]!.top - sectionRect.top) / zoom,
      bottomPadding: (sectionRect.bottom - frames[0]!.bottom) / zoom,
      headerHeight: headerRect.height / zoom,
      buttonHeight: buttonRect.height / zoom,
      headerGap: (sectionRect.top - headerRect.bottom) / zoom,
      frameGap: (frames[0]!.top - buttonRect.bottom) / zoom,
      headerScale: getComputedStyle(header).transform,
      sectionRadius: getComputedStyle(section).borderTopLeftRadius,
      sectionBorder: getComputedStyle(section).boxShadow,
      frameBorder: getComputedStyle(section.querySelector(".canvas-card__frame")!).outlineWidth,
    };
  });
  const { zoom: initialZoom, ...initial } = await dimensions();
  const board = page.locator('[data-test="canvas-board"]');
  for (const gesture of [{ deltaY: -1, steps: 120 }, { deltaY: 1, steps: 140 }]) {
    await board.evaluate((element, { deltaY, steps }) => {
      for (let step = 0; step < steps; step++) {
        element.dispatchEvent(new WheelEvent("wheel", { deltaY, ctrlKey: true, clientX: 400, clientY: 300, bubbles: true, composed: true }));
      }
    }, gesture);
    const { zoom, ...actual } = await dimensions();
    expect(Math.abs(zoom - initialZoom)).toBeGreaterThan(0.1);
    for (const key of Object.keys(initial) as (keyof typeof initial)[]) {
      const value = initial[key];
      if (typeof value === "number") expect(actual[key], key).toBeCloseTo(value, 1);
      else expect(actual[key], key).toBe(value);
    }
  }
});
