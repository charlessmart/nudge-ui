import { clickFrameAction, waitForCanvasTransition } from "./canvasTransition.ts";
import { test, expect } from "@playwright/test";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("HTML iteration DOM drags work and change counts describe final prompt intent", async ({ page }) => {
  await page.goto("/conformance");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  const cards = page.locator(".canvas-card");
  await expect(cards.first().locator('[data-test^="canvas-card-create-iteration-"]')).toBeEnabled();
  await cards.first().locator("iframe").contentFrame().locator("body").evaluate((body) => {
    const fixture = body.ownerDocument.createElement("section");
    fixture.id = "iteration-drag-fixture";
    fixture.style.cssText = "position:fixed;left:80px;top:100px;width:360px;background:white;z-index:1000;";
    fixture.innerHTML = '<div style="height:60px">First</div><div style="height:60px">Second</div><div style="height:60px">Third</div>';
    body.append(fixture);
  });
  await clickFrameAction(page, cards.first().locator('[data-test^="canvas-card-create-iteration-"]'));
  const iteration = cards.nth(1).locator("iframe");
  await expect(cards.nth(1).locator('[data-test^="canvas-card-create-iteration-"]')).toBeEnabled();
  await page.locator('[data-test="canvas-board-content"]').evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
  });
  const fixture = iteration.contentFrame().locator("#iteration-drag-fixture");
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
  await expect.poll(() => cards.first().locator("iframe").contentFrame().locator("#iteration-drag-fixture > div").allTextContents()).toEqual(["First", "Second", "Third"]);
  const artifactId = (await iteration.getAttribute("src"))!.split("/")[3]!;
  await page.request.delete(`/__nudge_ui__/artifacts/${artifactId}`);
});

test("duplicates slide right and iterations slide down with hover paused", async ({ page }) => {
  await page.goto("/conformance");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  const cards = page.locator(".canvas-card");
  async function captureEntrance(index: number): Promise<void> {
    await waitForCanvasTransition(page);
    await page.locator('[data-test="canvas-board-content"]').evaluate((board, index) => {
      const before = new DOMMatrixReadOnly(getComputedStyle(board).transform);
      const observer = new MutationObserver(() => {
        const card = board.querySelectorAll<HTMLElement>(".canvas-card")[index];
        if (!card) return;
        const entrance = card.getAnimations()[0];
        const frames = (entrance?.effect as KeyframeEffect | null)?.getKeyframes();
        if (!entrance || !frames) return;
        if (!card.dataset.testAnimationStart) card.dataset.testAnimationStart = JSON.stringify({
          interactionsPaused: board.parentElement!.classList.contains("is-layout-transitioning"),
          offsetX: parseFloat(card.style.left) - parseFloat(String(frames[0]?.left)),
          offsetY: parseFloat(card.style.top) - parseFloat(String(frames[0]?.top)),
          duration: entrance.effect?.getTiming().duration,
          opacity: frames[0]?.opacity,
          finalOpacity: frames.at(-1)?.opacity,
        });
        const camera = board.getAnimations()[0];
        if (!camera) return;
        const target = new DOMMatrixReadOnly((board as HTMLElement).style.transform);
        const previousTime = camera.currentTime;
        camera.pause();
        const sample = (time: number) => {
          camera.currentTime = time;
          const matrix = new DOMMatrixReadOnly(getComputedStyle(board).transform);
          return { x: matrix.e, y: matrix.f };
        };
        const from = sample(0);
        const middle = sample(75);
        const end = sample(150);
        card.dataset.testCameraStart = JSON.stringify({
          duration: camera.effect?.getTiming().duration,
          startsAtPreviousPosition: Math.hypot(from.x - before.e, from.y - before.f) < 0.1,
          movesThroughIntermediatePosition: Math.hypot(middle.x - from.x, middle.y - from.y) > 1
            && Math.hypot(middle.x - target.e, middle.y - target.f) > 1,
          reachesTargetAt150ms: Math.hypot(end.x - target.e, end.y - target.f) < 0.1,
        });
        camera.currentTime = previousTime;
        camera.play();
        observer.disconnect();
      });
      observer.observe(board, { childList: true, subtree: true, attributes: true });
    }, index);
  }
  const expectedCameraMotion = JSON.stringify({
    duration: 150, startsAtPreviousPosition: true,
    movesThroughIntermediatePosition: true, reachesTargetAt150ms: true,
  });
  await page.locator('[data-test="canvas-board"]').dispatchEvent("wheel", { deltaX: 120, deltaY: -80, bubbles: true, composed: true });
  await captureEntrance(1);
  await clickFrameAction(page, cards.first().locator('[data-test^="canvas-card-duplicate-"]'));
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(1)).toHaveAttribute("data-test-animation-start", JSON.stringify({ interactionsPaused: true, offsetX: 200, offsetY: 0, duration: 300, opacity: "0", finalOpacity: "1" }));
  await expect(cards.nth(1)).toHaveAttribute("data-test-camera-start", expectedCameraMotion);
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
  await clickFrameAction(page, cards.nth(1).locator('[data-test^="canvas-card-create-iteration-"]'));
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(2)).toHaveAttribute("data-test-animation-start", JSON.stringify({ interactionsPaused: true, offsetX: 0, offsetY: 200, duration: 300, opacity: "0", finalOpacity: "1" }));
  await expect(cards.nth(2)).toHaveAttribute("data-test-camera-start", expectedCameraMotion);
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

test("linked frame geometry scales with the canvas and controls retain their zoom behavior", async ({ page }) => {
  await page.goto("/conformance");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  const cards = page.locator(".canvas-card");
  await clickFrameAction(page, cards.first().locator('[data-test^="canvas-card-duplicate-"]'));
  await expect(cards).toHaveCount(2);
  await waitForCanvasTransition(page);
  await cards.first().focus();
  await expect(cards.first().locator(".canvas-card__floating-toolbar")).toHaveCSS("opacity", "1");
  const content = page.locator('[data-test="canvas-board-content"]');
  const dimensions = () => content.evaluate((element) => {
    const card = element.querySelector<HTMLElement>(".canvas-card")!;
    const rect = card.getBoundingClientRect();
    const button = card.querySelector<HTMLElement>('[data-test^="canvas-card-focus-"]')!;
    const action = card.querySelector<HTMLElement>('[data-test^="canvas-card-duplicate-"]')!;
    const badge = card.querySelector<HTMLElement>(".canvas-card__live-badge")!;
    const frames = [...element.querySelectorAll<HTMLElement>(".canvas-card")].map((frame) => frame.getBoundingClientRect());
    const zoom = new DOMMatrixReadOnly(getComputedStyle(element).transform).a;
    return {
      zoom,
      width: rect.width / zoom,
      height: rect.height / zoom,
      gap: (frames[1]!.left - frames[0]!.right) / zoom,
      buttonHeight: button.getBoundingClientRect().height,
      actionHeight: action.getBoundingClientRect().height,
      badgeHeight: badge.getBoundingClientRect().height,
      frameGap: rect.top - button.getBoundingClientRect().bottom,
      borders: [...element.querySelectorAll(".canvas-card__frame")].map((frame) => ({
        width: getComputedStyle(frame).outlineWidth, color: getComputedStyle(frame).outlineColor,
      })),
    };
  });
  const initial = await dimensions();
  const board = page.locator('[data-test="canvas-board"]');
  for (const gesture of [{ deltaY: -1, steps: 120 }, { deltaY: 1, steps: 140 }]) {
    await board.evaluate((element, { deltaY, steps }) => {
      for (let step = 0; step < steps; step++) {
        element.dispatchEvent(new WheelEvent("wheel", { deltaY, ctrlKey: true, clientX: 400, clientY: 300, bubbles: true, composed: true }));
      }
    }, gesture);
    const actual = await dimensions();
    expect(Math.abs(actual.zoom - initial.zoom)).toBeGreaterThan(0.1);
    const screenScale = Math.min(1, actual.zoom * 2);
    expect(actual.buttonHeight / screenScale).toBeCloseTo(32, 1);
    expect(actual.actionHeight / screenScale).toBeCloseTo(32, 1);
    expect(actual.badgeHeight / screenScale).toBeCloseTo(20, 1);
    expect(actual.frameGap / screenScale).toBeCloseTo(12, 1);
    expect(actual.width).toBeCloseTo(initial.width, 1);
    expect(actual.height).toBeCloseTo(initial.height, 1);
    expect(actual.gap).toBeCloseTo(initial.gap, 1);
    expect(actual.borders).toEqual([
      { width: "2px", color: "rgb(168, 85, 247)" },
      { width: "2px", color: "rgb(168, 85, 247)" },
    ]);
  }
});
