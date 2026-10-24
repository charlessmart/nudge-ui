import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { Frame, Page } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const APP_DIR = join(import.meta.dirname, "..", "app");

/** Sources whose bytes must never change during a session (ADR-0010). */
const WATCHED_SOURCES = [
  "layout.tsx",
  "page.tsx",
  "HeroCard.tsx",
  "ClientBadge.tsx",
  "sandbox.css",
] as const;

function sourceBytes(): Record<string, string> {
  return Object.fromEntries(
    WATCHED_SOURCES.map((name) => [name, readFileSync(join(APP_DIR, name), "utf8")]),
  );
}

async function inspectorReady(page: Page, path = "/"): Promise<Frame> {
  await page.goto(path);
  await expect(page).toHaveURL(/[?&]nudge-ui=editor(?:&|#|$)/);
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible({ timeout: 45_000 });
  await expect.poll(() => page.frames().find((frame) => frame !== page.mainFrame()
    && frame.url().startsWith("http")
    && !frame.url().includes("/__nudge_ui__/editor"))?.url() ?? "", { timeout: 45_000 }).toContain(path);
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame()
    && candidate.url().startsWith("http")
    && !candidate.url().includes("/__nudge_ui__/editor"));
  if (!frame) throw new Error("Next preview frame did not become ready");
  return frame;
}

test("dev: loader injects identity into server and client components", async ({ page }) => {
  const frame = await inspectorReady(page);

  const identity = await frame.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      return {
        cid: element.getAttribute("data-cid"),
        src: element.getAttribute("data-src"),
        cprops: element.getAttribute("data-cprops"),
      };
    };
    return {
      serverTitle: read("#page-title"),
      heroCard: read(".hero-card"),
      clientBadge: read('[data-testid="client-badge"]'),
    };
  });

  expect(identity.serverTitle?.cid).toBe("Home");
  expect(identity.serverTitle?.src).toMatch(/^app\/page\.tsx:\d+:\d+$/);

  expect(identity.heroCard?.cid).toBe("HeroCard");
  expect(identity.heroCard?.src).toMatch(/^app\/HeroCard\.tsx:\d+:\d+$/);
  expect(identity.heroCard?.cprops ?? "").not.toBe("");

  expect(identity.clientBadge?.cid).toBe("ClientBadge");
  expect(identity.clientBadge?.src).toMatch(/^app\/ClientBadge\.tsx:\d+:\d+$/);
});

test("dev: hydration preserves the injected attributes", async ({ page }) => {
  const ssrHtml = await (await page.request.get("/")).text();
  expect(ssrHtml).toContain('data-cid="HeroCard"');

  // No networkidle wait: the reload SSE stream keeps a connection open by design.
  const frame = await inspectorReady(page);

  const afterHydration = await frame.evaluate(() => ({
    cid: document.querySelector(".hero-card")?.getAttribute("data-cid"),
    src: document.querySelector(".hero-card")?.getAttribute("data-src"),
  }));
  expect(afterHydration.cid).toBe("HeroCard");
  expect(afterHydration.src ?? "").toMatch(/^app\/HeroCard\.tsx:\d+:\d+$/);

  const overlayText = await frame.evaluate(() => document.querySelector("nextjs-portal")?.shadowRoot?.textContent ?? "");
  expect(overlayText).not.toContain("Hydration");
});

test("dev: raw CSS preview applies through the managed sheet and survives navigation", async ({
  page,
}) => {
  const frame = await inspectorReady(page);

  const target = frame.locator(".hero-card h2");
  await target.click();
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();
  // Let the editor surface finish binding its control handlers.
  await page.waitForTimeout(1200);

  // Editors mount asynchronously after selection, so wait for the field, with one re-select retry for cold-start compilation.
  const widthInput = page.locator(
    '[data-test="token-field"][data-property="width"] [data-test="raw-input"]',
  );
  await widthInput.waitFor({ state: "visible", timeout: 15_000 }).catch(async () => {
    await frame.locator(".hero-card h2").click();
    await expect(page.locator('[data-test="style-editors"]')).toBeVisible();
    await widthInput.waitFor({ state: "visible", timeout: 15_000 });
  });
  await widthInput.evaluate((el, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    el.focus();
    setter.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
  }, "240px");

  await expect.poll(() => managedSheetText(frame)).toContain("240px");
  await expect(target).toHaveCSS("width", "240px");

  // Whichever way the App Router restores the route (bfcache or fresh bootstrap), the persisted session must reproject into the managed stylesheet.
  // The element-selection tool consumes pointer events, so links stay inert until the app-interaction tool is active.
  await page.locator('[data-test="canvas-tool-select"]').click();
  await frame.locator('a[href="/second"]').click();
  await expect.poll(() => frame.url()).toMatch(/\/second$/);
  await expect(frame.locator("#page-title")).toContainText("Second route");
  // Off-route the rule is withdrawn while its target is absent, then reprojected on return.
  await expect.poll(() => managedSheetText(frame)).not.toContain("240px");

  await frame.locator('a[href="/"]').click();
  await expect.poll(() => frame.url()).toMatch(/\/$/);
  await expect(frame.locator(".hero-card")).toBeVisible();
  await expect
    .poll(() => managedSheetText(frame), { timeout: 15_000 })
    .toContain("240px");
  await expect(frame.locator(".hero-card h2")).toHaveCSS("width", "240px");
});

test("dev: prompt copy names the source location without runtime selectors", async ({ page }) => {
  const frame = await inspectorReady(page);

  const target = frame.locator(".hero-card h2");
  await target.click();

  await target.click();
  const input = page.locator(
    '[data-test="token-field"][data-property="width"] [data-test="raw-input"]',
  );
  await input.waitFor({ state: "visible", timeout: 15_000 }).catch(async () => {
    await frame.locator(".hero-card h2").click();
    await expect(page.locator('[data-test="style-editors"]')).toBeVisible();
    await input.waitFor({ state: "visible", timeout: 15_000 });
  });
  await input.evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    el.focus();
    setter.call(el, "241px");
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
  });
  await expect.poll(() => managedSheetText(frame)).toContain("241px");

  const copyButton = page.locator('[data-test="copy-prompt"]');
  await expect(copyButton).toBeEnabled();
  await copyButton.click();

  // The clipboard write races the click handler; poll until it lands.
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("app/HeroCard.tsx:");
  expect(await page.evaluate(() => navigator.clipboard.readText())).not.toContain("data-cid");
});

test("dev: source files stay byte-for-byte unchanged across a session", async ({ page }) => {
  const before = sourceBytes();

  const frame = await inspectorReady(page);
  const target = frame.locator(".hero-card h2");
  await target.click();
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();

  const after = sourceBytes();
  expect(after).toEqual(before);
});

test("dev: route-group segments are instrumented through the shared root", async ({ page }) => {
  const frame = await inspectorReady(page, "/pricing");
  // Route groups are elided from URLs: app/(shop)/pricing/page.tsx serves /pricing.
  const identity = await frame.evaluate(() => ({
    cid: document.querySelector("#page-title")?.getAttribute("data-cid"),
    src: document.querySelector("#page-title")?.getAttribute("data-src"),
  }));
  expect(identity.cid).toBe("PricingPage");
  expect(identity.src).toMatch(/^app\/\(shop\)\/pricing\/page\.tsx:\d+:\d+$/);
});
