import { expect, test } from "@playwright/test";
import type { Frame, Page } from "@playwright/test";

/**
 * Tracer-bullet conformance for the Astro host Adapter (ADR-0011, Stage 3).
 * The full portfolio suite (selection edits, prompt copy, island prop
 * changes, build purity in CI) lands with Stage 6; scripts/smoke.mjs carries
 * the same checks as a standalone script.
 */

async function inspectorReady(page: Page): Promise<Frame> {
  await page.goto("/");
  await expect(page).toHaveURL(/[?&]nudge-ui=editor(?:&|#|$)/);
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as { __nudgeUi?: unknown }).__nudgeUi)))
    .toBe(true);
  await expect.poll(() => page.frames().find((frame) => frame !== page.mainFrame()
    && frame.url().startsWith("http")
    && !frame.url().includes("/__nudge_ui__/editor"))?.url() ?? "").toMatch(/\/$/);
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame()
    && candidate.url().startsWith("http")
    && !candidate.url().includes("/__nudge_ui__/editor"));
  if (!frame) throw new Error("Astro preview frame did not become ready");
  await expect.poll(() => frame.evaluate(() =>
    Boolean((window as unknown as { __nudgeUi?: unknown }).__nudgeUi),
  )).toBe(true);
  return frame;
}

test("dev: inspector mounts and rendered pages carry honest Astro identity", async ({ page }) => {
  const frame = await inspectorReady(page);

  const identity = await frame.evaluate(() => {
    const element = document.querySelector('[data-cid^="astro:"]');
    return {
      cid: element?.getAttribute("data-cid") ?? null,
      src: element?.getAttribute("data-src") ?? null,
    };
  });

  expect(identity.cid).toMatch(/^astro:/);
  // Source coordinates are optional in Astro's compiler contract. When they
  // are absent, the adapter must not invent a file location.
  expect(identity.src === null || /\.astro:\d+:\d+$/.test(identity.src)).toBe(true);
});

test("dev: server HTML carries the response identity layer", async ({ request }) => {
  const response = await request.get("/");
  const html = await response.text();
  expect(html).toContain('data-cid="astro:');
  // Astro may include source annotations, depending on compiler support. The
  // response layer must preserve them when present and remain valid without.
  const annotationCount = html.match(/data-astro-source-file=/g)?.length ?? 0;
  if (annotationCount > 0) {
    expect(html).toContain("data-astro-source-loc=");
    expect(html).toMatch(/data-src="[^"]+\.astro:\d+/);
  }
});

test("dev: the inspection bridge preserves degraded Header identity", async ({ page }) => {
  const frame = await inspectorReady(page);

  const inspection = await frame.evaluate(() =>
    (window as unknown as {
      __nudgeUi?: { inspect(selector: string): { identity: { cid: string | null; src: string } } | null };
    }).__nudgeUi?.inspect(".site-header .site-title") ?? null,
  );

  expect(inspection).not.toBeNull();
  expect(inspection!.identity.cid).toMatch(/^astro:/);
  expect(
    inspection!.identity.src === ""
      || inspection!.identity.src.includes("src/components/Header.astro"),
  ).toBe(true);
});

test("dev: server HTML is instrumented before the browser sees it", async ({ request }) => {
  const response = await request.get("/about");
  expect(response.headers()["content-type"]).toContain("text/html");
  const html = await response.text();
  expect(html).toContain('data-cid="astro:');
  const sourceIdentity = html.match(/data-src="([^"]+)"/)?.[1];
  if (sourceIdentity !== undefined) {
    expect(sourceIdentity).toMatch(/src\/pages\/about\.astro:\d+(?::\d+)?/);
  }
});
