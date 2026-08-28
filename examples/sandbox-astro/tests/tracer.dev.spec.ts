import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Tracer-bullet conformance for the Astro host Adapter (ADR-0011, Stage 3).
 * The full portfolio suite (selection edits, prompt copy, island prop
 * changes, build purity in CI) lands with Stage 6; scripts/smoke.mjs carries
 * the same checks as a standalone script.
 */

async function inspectorReady(page: Page): Promise<void> {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => Boolean(document.getElementById("nudge-ui-root"))))
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as { __nudgeUi?: unknown }).__nudgeUi)))
    .toBe(true);
}

test("dev: inspector mounts and rendered pages carry astro source identity", async ({ page }) => {
  await inspectorReady(page);

  const identity = await page.evaluate(() => {
    const element = document.querySelector('[data-cid^="astro:"]');
    return {
      cid: element?.getAttribute("data-cid") ?? null,
      src: element?.getAttribute("data-src") ?? null,
    };
  });

  expect(identity.cid).toMatch(/^astro:/);
  expect(identity.src).toMatch(/\.astro:\d+:\d+$/);
});

test("dev: server HTML carries Astro's annotations beside our identity layer", async ({ request }) => {
  // Astro's dev toolbar strips its own annotations from the live DOM shortly
  // after load (ADR-0011); the raw server response must still carry them,
  // forwarded untouched next to Nudge UI's identity layer.
  const response = await request.get("/");
  const html = await response.text();
  expect(html.match(/data-astro-source-file=/g)?.length).toBeGreaterThan(0);
  expect(html).toContain('data-cid="astro:');
});

test("dev: the inspection bridge resolves exact Header.astro identity", async ({ page }) => {
  await inspectorReady(page);

  const inspection = await page.evaluate(() =>
    (window as unknown as {
      __nudgeUi?: { inspect(selector: string): { identity: { cid: string | null; src: string } } | null };
    }).__nudgeUi?.inspect(".site-header .site-title") ?? null,
  );

  expect(inspection).not.toBeNull();
  expect(inspection!.identity.cid).toMatch(/^astro:/);
  expect(inspection!.identity.src).toContain("src/components/Header.astro");
});

test("dev: server HTML is instrumented before the browser sees it", async ({ request }) => {
  const response = await request.get("/about");
  expect(response.headers()["content-type"]).toContain("text/html");
  const html = await response.text();
  expect(html).toContain('data-cid="astro:');
  expect(html).toContain('data-src="src/pages/about.astro');
});
