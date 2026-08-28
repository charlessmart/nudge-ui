import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Canvas workspace specs for the Next.js host (ADR-0006 over ADR-0010).
 *
 * The controller/runtime code is host-agnostic; these specs prove the
 * Next-specific integration surfaces ADR-0010 deferred canvas pending:
 * asynchronous renderer boots under Turbopack (handshake solicitation),
 * App Router soft navigation inside cards (link-discovered cards and
 * frame-metadata), durable sessions across full-page handoff, and
 * single-writer workspace ownership.
 */

async function inspectorReady(page: Page): Promise<void> {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => Boolean(document.getElementById("nudge-ui-root"))))
    .toBe(true);
  await expect(page.locator('[data-test="inspect-tab"]')).toBeAttached();
  // The inspection bridge installs before the panel renders, so once this
  // lands the mode toggle exists and locator clicks auto-wait for it.
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as { __nudgeUi?: unknown }).__nudgeUi)))
    .toBe(true);
}

/** Waits until every card iframe has completed the renderer handshake. */
async function cardsReady(page: Page): Promise<void> {
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await page.waitForFunction(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    const iframes = [...(sr?.querySelectorAll<HTMLIFrameElement>("iframe[data-test^='canvas-card-iframe-']") ?? [])];
    return iframes.length > 0 && iframes.every((f) => {
      try {
        return Boolean((f.contentWindow as (Window & { __nudgeUi?: unknown }) | null)?.__nudgeUi);
      } catch {
        return false;
      }
    });
  }, { timeout: 45_000 });
}

async function enterCanvas(page: Page): Promise<void> {
  await page.locator('[data-test="mode-canvas"]').click();
  await cardsReady(page);
}

/** Makes one durable width edit through the inspect-mode panel. */
async function makeWidthEdit(page: Page, value: string): Promise<void> {
  await page.locator(".hero-card h2").evaluate((el) => {
    if (!(el instanceof HTMLElement)) throw new Error("target is not an HTMLElement");
    el.click();
  });
  const input = page.locator('[data-test="token-field"][data-property="width"] [data-test="raw-input"]');
  await input.waitFor({ state: "visible", timeout: 20_000 }).catch(async () => {
    await page.locator(".hero-card h2").evaluate((el) => {
      if (el instanceof HTMLElement) el.click();
    });
    await input.waitFor({ state: "visible", timeout: 20_000 });
  });
  await input.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    el.focus();
    setter.call(el, v);
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
  }, value);
  await expect.poll(() => page.evaluate(() => {
    const h2 = document.querySelector(".hero-card h2");
    return h2 ? getComputedStyle(h2).width : null;
  })).toBe(value);
}

test("dev: canvas board mounts with a live renderer card", async ({ page }) => {
  await inspectorReady(page);
  await enterCanvas(page);

  const boardContent = page.locator('[data-test="canvas-board-content"]');
  await expect(boardContent).toHaveAttribute("style", /transform/);

  // The card embeds the real application document, identity attributes included.
  const cardFrame = page.frames().find((f) => f !== page.mainFrame());
  expect(cardFrame).toBeTruthy();
  await expect(cardFrame!.locator(".hero-card")).toBeVisible({ timeout: 30_000 });
  await expect(cardFrame!.locator(".hero-card")).toHaveAttribute("data-cid", "HeroCard");
});

test("dev: canonical edits project into renderer cards", async ({ page }) => {
  await inspectorReady(page);
  await makeWidthEdit(page, "313px");
  await enterCanvas(page);

  const cardFrame = page.frames().find((f) => f !== page.mainFrame())!;
  await expect.poll(() =>
    cardFrame.evaluate(() => {
      const h2 = document.querySelector(".hero-card h2");
      return h2 ? getComputedStyle(h2).width : null;
    }), { timeout: 20_000 },
  ).toBe("313px");
});

test("dev: links inside a card discover new route cards", async ({ page }) => {
  await inspectorReady(page);
  await enterCanvas(page);

  // Clicking the app's client-side Link inside the renderer must surface a
  // /second card through navigation-intent rather than navigating the frame.
  const cardFrame = page.frames().find((f) => f !== page.mainFrame())!;
  await cardFrame.locator('a[href="/second"]').evaluate((el) => {
    if (!(el instanceof HTMLElement)) throw new Error("nav link is not an HTMLElement");
    el.click();
  });

  await page.waitForFunction(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    const paths = [...(sr?.querySelectorAll("[data-card-id]") ?? [])].map((c) => {
      const f = c.querySelector("iframe");
      try {
        return new URL(f!.contentWindow!.location.href).pathname;
      } catch {
        return "?";
      }
    });
    return paths.includes("/second");
  }, undefined, { timeout: 45_000 });

  // Both cards stay live renderers.
  await cardsReady(page);
});

test("dev: navigation intent focuses an existing card for a known route", async ({ page }) => {
  await inspectorReady(page);
  await enterCanvas(page);

  const firstFrame = page.frames().find((f) => f !== page.mainFrame())!;
  await firstFrame.locator('a[href="/second"]').click();

  await page.waitForFunction(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    const paths = [...(sr?.querySelectorAll("[data-card-id]") ?? [])].map((c) => {
      const f = c.querySelector("iframe");
      try {
        return new URL(f!.contentWindow!.location.href).pathname;
      } catch {
        return "?";
      }
    });
    return paths.includes("/second");
  }, undefined, { timeout: 45_000 });

  // Navigating the /second card back home must focus the existing "/" card,
  // not spawn a third. Poll the count: an errant addCanvasCard would surface
  // as 3 whenever the intent round-trip lands.
  const secondFrame = page.frames().find((f) => f.url().endsWith("/second"));
  expect(secondFrame).toBeTruthy();
  await secondFrame!.locator('a[href="/"]').evaluate((el) => {
    if (!(el instanceof HTMLElement)) throw new Error("nav link is not an HTMLElement");
    el.click();
  });

  await expect
    .poll(() => page.evaluate(() => {
      const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
      return sr?.querySelectorAll("[data-card-id]").length ?? 0;
    }), { timeout: 15_000 })
    .toBe(2);
});

test("dev: page view hands off editing to the card's route with the session intact", async ({ page }) => {
  await inspectorReady(page);
  await makeWidthEdit(page, "314px");
  await enterCanvas(page);

  await page.locator('[data-test^="canvas-card-preview-"]').first().click();
  await page.waitForURL("**/");
  await expect(page.locator(".hero-card h2")).toHaveCSS("width", "314px", { timeout: 30_000 });

  // The workspace lease may be re-acquired cleanly or behind the ownership
  // notice after the full-page navigation; both end with the session applied.
  const takeover = page.locator('[data-test="locked-workspace-notice"] [data-test="takeover-here"]');
  try {
    await takeover.waitFor({ state: "visible", timeout: 4_000 });
    await takeover.click();
  } catch {
    // Clean re-acquire.
  }
  await expect(page.locator(".hero-card h2")).toHaveCSS("width", "314px");
});

test("dev: canvas layout is durable across a controller reload", async ({ page }) => {
  await inspectorReady(page);
  await enterCanvas(page);

  // Add a second card by link discovery so the board has distinguishable state.
  const cardFrame = page.frames().find((f) => f !== page.mainFrame())!;
  await cardFrame.locator('a[href="/second"]').click();
  await page.waitForFunction(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    return (sr?.querySelectorAll("[data-card-id]") ?? []).length >= 2;
  }, undefined, { timeout: 45_000 });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect
    .poll(() => page.evaluate(() => Boolean(document.getElementById("nudge-ui-root"))))
    .toBe(true);
  // The persisted session restores canvas mode without touching the toggle.
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => page.evaluate(() => {
      const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
      return sr?.querySelectorAll("[data-card-id]").length ?? 0;
    }))
    .toBe(2);
});

test("dev: a second tab cannot take the workspace while canvas holds it", async ({ page, context }) => {
  await inspectorReady(page);
  await enterCanvas(page);

  const second = await context.newPage();
  await second.goto("/second");
  await expect(second.locator('[data-test="locked-workspace-notice"]')).toBeVisible({ timeout: 30_000 });
  await second.close();
});
