import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
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

async function inspectorReady(page: Page): Promise<void> {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => Boolean(document.getElementById("design-tool-root"))))
    .toBe(true);
  await expect(page.locator('[data-test="inspect-tab"]')).toBeVisible();
  // The bootstrap must have installed the runtime (bridge) before any
  // interaction, and the app's hydration must have attached fibers — both
  // race the mount on a cold dev server.
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as { __designTool?: unknown }).__designTool)))
    .toBe(true);
  await page.waitForTimeout(1500);
}

test("dev: loader injects identity into server and client components", async ({ page }) => {
  await inspectorReady(page);

  const identity = await page.evaluate(() => {
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

  // Server component elements carry identity (cid = enclosing component).
  expect(identity.serverTitle?.cid).toBe("Home");
  expect(identity.serverTitle?.src).toMatch(/^app\/page\.tsx:\d+:\d+$/);

  expect(identity.heroCard?.cid).toBe("HeroCard");
  expect(identity.heroCard?.src).toMatch(/^app\/HeroCard\.tsx:\d+:\d+$/);
  // Every rendered element carries the callsite-evidence attribute.
  expect(identity.heroCard?.cprops ?? "").not.toBe("");

  // Client-component internals are identified as well.
  expect(identity.clientBadge?.cid).toBe("ClientBadge");
  expect(identity.clientBadge?.src).toMatch(/^app\/ClientBadge\.tsx:\d+:\d+$/);
});

test("dev: hydration preserves the injected attributes", async ({ page }) => {
  // Server HTML carries the attributes...
  const ssrHtml = await (await page.request.get("/")).text();
  expect(ssrHtml).toContain('data-cid="HeroCard"');

  // ...and hydration must not strip them (React preserves unknown attributes
  // present in server HTML; this asserts rather than assumes). No
  // networkidle wait: the reload SSE stream keeps a connection open by
  // design.
  await inspectorReady(page);

  const afterHydration = await page.evaluate(() => ({
    cid: document.querySelector(".hero-card")?.getAttribute("data-cid"),
    src: document.querySelector(".hero-card")?.getAttribute("data-src"),
  }));
  expect(afterHydration.cid).toBe("HeroCard");
  expect(afterHydration.src ?? "").toMatch(/^app\/HeroCard\.tsx:\d+:\d+$/);

  // No hydration error overlay in dev.
  const overlayText = await page.evaluate(() => document.querySelector("nextjs-portal")?.shadowRoot?.textContent ?? "");
  expect(overlayText).not.toContain("Hydration");
});

test("dev: raw CSS preview applies through the managed sheet and survives navigation", async ({
  page,
}) => {
  await inspectorReady(page);

  // Select the hero card heading.
  const target = page.locator(".hero-card h2");
  await target.evaluate((element) => {
    if (!(element instanceof HTMLElement)) throw new Error("target is not an HTMLElement");
    element.click();
  });
  await expect(page.locator('[data-test="selection"]')).toHaveAttribute(
    "data-selected-cid",
    "HeroCard",
  );
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();
  // Let the editor surface finish binding its control handlers.
  await page.waitForTimeout(1200);

  // Edit the width raw value (Layout section is expanded by default and the
  // field is a plain text input; color renders a token chip now that tokens
  // are catalogued). The editors mount asynchronously after selection, so
  // wait for the field rather than querying immediately, with one re-select
  // retry for cold-start compilation.
  const widthInput = page.locator(
    '[data-test="token-field"][data-property="width"] [data-test="raw-input"]',
  );
  await widthInput.waitFor({ state: "visible", timeout: 15_000 }).catch(async () => {
    await page.locator(".hero-card h2").evaluate((el) => {
      if (el instanceof HTMLElement) el.click();
    });
    await expect(page.locator('[data-test="selection"]')).toHaveAttribute(
      "data-selected-cid",
      "HeroCard",
    );
    await widthInput.waitFor({ state: "visible", timeout: 15_000 });
  });
  await widthInput.evaluate((el, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    el.focus();
    setter.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
  }, "240px");

  await expect.poll(() => managedSheetText(page)).toContain("240px");
  await expect(target).toHaveCSS("width", "240px");

  // The durable session must survive leaving the route and reapply to the
  // remounted element on return. Leave via a real navigation, come back
  // through browser history: whichever way App Router restores the route
  // (bfcache or fresh bootstrap), the persisted session must reproject into
  // the managed stylesheet.
  await page.goto("/second");
  await expect(page.locator("#page-title")).toContainText("Second route");
  // The edited element lives only on "/", so nothing projects here.
  await expect.poll(() => managedSheetText(page)).not.toContain("240px");

  await page.goBack({ waitUntil: "domcontentloaded" });

  // Depending on whether the outgoing document entered the back/forward
  // cache, the returning document either acquires the workspace lease
  // cleanly or finds it recorded and shows the ownership notice whose
  // explicit takeover resumes control. Both paths must end with the session
  // reprojected onto the remounted element.
  const takeoverButton = page.locator('[data-test="locked-workspace-notice"] [data-test="takeover-here"]');
  try {
    await takeoverButton.waitFor({ state: "visible", timeout: 4_000 });
    await takeoverButton.click();
  } catch {
    // Clean re-acquire: no notice appeared.
  }

  await expect(page.locator(".hero-card")).toBeVisible();
  await expect
    .poll(() => managedSheetText(page), { timeout: 15_000 })
    .toContain("240px");
  await expect(page.locator(".hero-card h2")).toHaveCSS("width", "240px");
});

// Skipped pending issue 0060: React 19-canary click delegation inside the
// shadow-root mount does not dispatch onClick under Next 16 dev, so the
// copy-prompt button cannot be driven end-to-end yet. Prompt GENERATION
// itself is covered by unit suites and the Vite sandbox e2e.
test.skip("dev: prompt copy names the source location and selector fallback", async ({ page }) => {
  await inspectorReady(page);

  const target = page.locator(".hero-card h2");
  await target.evaluate((element) => {
    if (!(element instanceof HTMLElement)) throw new Error("target is not an HTMLElement");
    element.click();
  });
  await expect(page.locator('[data-test="selection"]')).toHaveAttribute(
    "data-selected-cid",
    "HeroCard",
  );

  // The copy control enables once the session holds a change; make one.
  await page.evaluate(() => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    const input = root?.querySelector(
      '[data-test="token-field"][data-property="opacity"] [data-test="raw-input"]',
    ) as HTMLInputElement | null;
    if (!input) throw new Error("Missing color raw input");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    input.focus();
    setter.call(input, "rgb(0, 102, 204)");
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
  });
  await expect.poll(() => managedSheetText(page)).toContain("rgb(0, 102, 204)");

  const copyButton = page.locator('[data-test="copy-prompt"]');
  await expect(copyButton).toBeEnabled();
  await copyButton.click();

  // The clipboard write races the click handler; poll until it lands.
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("app/HeroCard.tsx:");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "## Selectors (fallback)",
  );
});

test("dev: source files stay byte-for-byte unchanged across a session", async ({ page }) => {
  const before = sourceBytes();

  await inspectorReady(page);
  // Interact: select, edit, navigate — the full instrumented lifecycle.
  const target = page.locator(".hero-card h2");
  await target.evaluate((element) => {
    if (!(element instanceof HTMLElement)) throw new Error("target is not an HTMLElement");
    element.click();
  });
  await page.waitForURL("**/");

  const after = sourceBytes();
  expect(after).toEqual(before);
});
