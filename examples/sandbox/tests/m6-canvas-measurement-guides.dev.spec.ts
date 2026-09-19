import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await expect(page.locator(".canvas-card__iframe").first()).toBeAttached();
  await expect(page.frameLocator(".canvas-card__iframe").first().locator("body")).toBeVisible({ timeout: 20_000 });
});

async function installMeasurementFixtures(frame: import("@playwright/test").FrameLocator): Promise<void> {
  await frame.locator("body").evaluate(() => {
    const addFixture = (id: string, cid: string, left: number, top: number) => {
      const element = document.createElement("div");
      element.id = id;
      element.tabIndex = -1;
      element.dataset.cid = cid;
      element.dataset.src = `CanvasGuideFixture.tsx:${cid === "CanvasHoverFixture" ? 1 : 2}:1`;
      Object.assign(element.style, {
        position: "fixed",
        left: `${left}px`,
        top: `${top}px`,
        width: "120px",
        height: "120px",
        background: "rgb(255 255 255)",
        zIndex: "10",
      });
      document.body.appendChild(element);
    };
    addFixture("canvas-measurement-hover", "CanvasHoverFixture", 80, 80);
    addFixture("canvas-measurement-selected", "CanvasSelectedFixture", 500, 360);
  });
}

test("dev: Canvas projects the shared measurement geometry while keeping labels in iframe CSS pixels", async ({ page }) => {
  const frame = page.frameLocator(".canvas-card__iframe").first();
  await installMeasurementFixtures(frame);

  await frame.locator("#canvas-measurement-selected").click();
  await frame.locator("#canvas-measurement-hover").hover();
  await frame.locator("#canvas-measurement-hover").focus();
  await page.keyboard.down("Alt");

  await expect.poll(() => page.evaluate(() => {
    const root = document.getElementById("nudge-ui-root")?.shadowRoot;
    const overlay = root?.querySelector("[data-test='canvas-measurement-overlay']");
    return {
      visible: overlay !== null,
      guides: root?.querySelectorAll("[data-test='canvas-measurement-overlay'] .alignment-guide").length ?? 0,
      rulers: root?.querySelectorAll("[data-test='canvas-measurement-overlay'] [data-test='measurement-ruler']").length ?? 0,
      projections: root?.querySelectorAll("[data-test='canvas-measurement-overlay'] [data-test='measurement-projection']").length ?? 0,
      labels: [...(root?.querySelectorAll("[data-test='canvas-measurement-overlay'] [data-test='measurement-label']") ?? [])]
        .map((label) => label.textContent),
    };
  })).toEqual({
    visible: true,
    guides: 4,
    rulers: 2,
    projections: 2,
    labels: expect.arrayContaining(["300px", "160px"]),
  });

  await page.keyboard.up("Alt");
  await expect(page.locator('[data-test="canvas-measurement-overlay"]')).not.toBeAttached();
});

test("dev: Canvas measurements stay within the active iframe and omit self-rulers", async ({ page }) => {
  const frame = page.frameLocator(".canvas-card__iframe").first();
  await installMeasurementFixtures(frame);

  await frame.locator("#canvas-measurement-selected").click();
  await frame.locator("#canvas-measurement-selected").hover();
  await frame.locator("#canvas-measurement-selected").focus();
  await page.keyboard.down("Alt");

  await expect.poll(() => page.evaluate(() => {
    const root = document.getElementById("nudge-ui-root")?.shadowRoot;
    return {
      guides: root?.querySelectorAll("[data-test='canvas-measurement-overlay'] .alignment-guide").length ?? 0,
      rulers: root?.querySelectorAll("[data-test='canvas-measurement-overlay'] [data-test='measurement-ruler']").length ?? 0,
    };
  })).toEqual({ guides: 4, rulers: 0 });

  await page.locator('[data-test="canvas-show-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"][data-presentation="canvas"]')).toBeVisible();
  await page.locator('[data-test="canvas-workspace"]').hover({ position: { x: 4, y: 60 } });
  await expect(page.locator('[data-test="canvas-measurement-overlay"]')).not.toBeAttached();
  await page.keyboard.up("Alt");

  await frame.locator('a[href="/conformance"]').click();
  await expect(page.locator(".canvas-card__iframe")).toHaveCount(1);
  const secondFrame = page.frameLocator(".canvas-card__iframe").first();
  await expect(secondFrame.locator("body")).toBeVisible({ timeout: 20_000 });
  const secondTarget = secondFrame.locator("[data-cid]").first();
  await secondTarget.hover();
  await secondTarget.focus();
  await page.keyboard.down("Alt");

  await expect(page.locator('[data-test="canvas-measurement-overlay"]')).not.toBeAttached();
  await page.keyboard.up("Alt");
});
