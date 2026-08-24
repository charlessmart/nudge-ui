import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Canvas workspace specs for the standalone static HTML host (ADR-0006 over
 * ADR-0012): multi-page same-origin previews served by the loopback CLI,
 * projection into renderer cards, link-discovered page cards, and durable
 * sessions — with no framework runtime in the prototype.
 */

async function inspectorReady(page: Page): Promise<void> {
  // The server prints "/" as the project root; users open the directory URL,
  // not /index.html. Card deduplication must treat both as one route.
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as { __designTool?: unknown }).__designTool)))
    .toBe(true);
  await expect(page.locator('[data-test="inspect-tab"]')).toBeAttached();
}

async function cardsReady(page: Page, expected: number): Promise<void> {
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await page.waitForFunction((count) => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const iframes = [...(sr?.querySelectorAll<HTMLIFrameElement>("iframe[data-test^='canvas-card-iframe-']") ?? [])];
    return iframes.length >= count && iframes.every((f) => {
      try {
        return Boolean((f.contentWindow as (Window & { __designTool?: unknown }) | null)?.__designTool);
      } catch {
        return false;
      }
    });
  }, expected, { timeout: 30_000 });
}

test("dev: canvas mounts a live renderer card for the current page", async ({ page }) => {
  await inspectorReady(page);
  await page.locator('[data-test="mode-canvas"]').click();
  await cardsReady(page, 1);

  const cardFrame = page.frames().find((f) => f !== page.mainFrame());
  expect(cardFrame).toBeTruthy();
  await expect(cardFrame!.locator("#hero-title")).toBeVisible({ timeout: 20_000 });
});

test("dev: canonical edits project into renderer cards", async ({ page }) => {
  await inspectorReady(page);

  // Edit the hero title width through the panel.
  await page.locator("#hero-title").evaluate((el) => {
    if (!(el instanceof HTMLElement)) throw new Error("target is not an HTMLElement");
    el.click();
  });
  const input = page.locator('[data-test="token-field"][data-property="width"] [data-test="raw-input"]');
  await input.waitFor({ state: "visible", timeout: 15_000 });
  await input.evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    el.focus();
    setter.call(el, "313px");
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
  });

  await page.locator('[data-test="mode-canvas"]').click();
  await cardsReady(page, 1);

  const cardFrame = page.frames().find((f) => f !== page.mainFrame())!;
  await expect.poll(() =>
    cardFrame.evaluate(() => {
      const title = document.querySelector("#hero-title");
      return title ? getComputedStyle(title).width : null;
    }),
  ).toBe("313px");
});

test("dev: links inside a card discover sibling page cards", async ({ page }) => {
  await inspectorReady(page);
  await page.locator('[data-test="mode-canvas"]').click();
  await cardsReady(page, 1);

  const cardFrame = page.frames().find((f) => f !== page.mainFrame())!;
  await cardFrame.locator('a[href="/second.html"]').evaluate((el) => {
    if (!(el instanceof HTMLElement)) throw new Error("nav link is not an HTMLElement");
    el.click();
  });

  await page.waitForFunction(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const paths = [...(sr?.querySelectorAll("[data-card-id]") ?? [])].map((c) => {
      const f = c.querySelector("iframe");
      try {
        return new URL(f!.contentWindow!.location.href).pathname;
      } catch {
        return "?";
      }
    });
    return paths.includes("/second.html");
  }, undefined, { timeout: 30_000 });
  await cardsReady(page, 2);

  // Navigating the second card back home via /index.html must focus the
  // existing "/" card: directory and index-file URLs are one route.
  const secondFrame = page.frames().find((f) => f.url().endsWith("/second.html"));
  expect(secondFrame).toBeTruthy();
  await secondFrame!.locator('a[href="/index.html"]').evaluate((el) => {
    if (!(el instanceof HTMLElement)) throw new Error("nav link is not an HTMLElement");
    el.click();
  });
  await expect
    .poll(() => page.evaluate(() => {
      const sr = document.getElementById("design-tool-root")?.shadowRoot;
      return sr?.querySelectorAll("[data-card-id]").length ?? 0;
    }), { timeout: 15_000 })
    .toBe(2);
});

test("dev: canvas layout is durable across a controller reload", async ({ page }) => {
  await inspectorReady(page);
  await page.locator('[data-test="mode-canvas"]').click();
  await cardsReady(page, 1);

  const cardFrame = page.frames().find((f) => f !== page.mainFrame())!;
  await cardFrame.locator('a[href="/second.html"]').evaluate((el) => {
    if (!(el instanceof HTMLElement)) throw new Error("nav link is not an HTMLElement");
    el.click();
  });
  await page.waitForFunction(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    return (sr?.querySelectorAll("[data-card-id]") ?? []).length >= 2;
  }, undefined, { timeout: 30_000 });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect
    .poll(() => page.evaluate(() => Boolean(document.getElementById("design-tool-root"))))
    .toBe(true);
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(() => page.evaluate(() => {
      const sr = document.getElementById("design-tool-root")?.shadowRoot;
      return sr?.querySelectorAll("[data-card-id]").length ?? 0;
    }))
    .toBe(2);
});
